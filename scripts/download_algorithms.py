#!/usr/bin/env python3
"""Clone reproducible upstream algorithm trees without invoking a shell."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

from project import (ROOT, DependencyRepository, dependency_repositories,
                     download_path, repository_for, selected_algorithms)


def run(command: list[str], cwd: Path | None = None) -> None:
    print("+", " ".join(command))
    subprocess.run(command, cwd=cwd, check=True)


def clone(repository, destination: Path, refresh: bool) -> None:
    source = repository.url
    configured_local_path = (
        os.environ.get(repository.local_path_env, "")
        if repository.local_path_env else ""
    ) or repository.local_path
    if configured_local_path:
        local_source = Path(configured_local_path).expanduser().resolve()
        if not (local_source / ".git").is_dir():
            raise RuntimeError(f"local upstream is not a Git repository: {local_source}")
        source = str(local_source)
    if not source:
        variable = repository.local_path_env or "the configured local path"
        raise RuntimeError(f"no upstream source is available; set {variable}")
    if destination.exists() and not (destination / ".git").is_dir():
        raise RuntimeError(f"refusing to overwrite non-git directory: {destination}")
    created = not destination.exists()
    if created:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.mkdir()
        run(["git", "init"], destination)
        run(["git", "remote", "add", "origin", source], destination)
        run(["git", "fetch", "--depth", "1", "origin", repository.ref], destination)
        run(["git", "checkout", "--detach", "FETCH_HEAD"], destination)
    has_head = subprocess.run(
        ["git", "rev-parse", "--verify", "HEAD"], cwd=destination,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
    if not created:
        run(["git", "remote", "set-url", "origin", source], destination)
    if not created and (refresh or not has_head):
        run(["git", "fetch", "--depth", "1", "origin", repository.ref], destination)
        run(["git", "checkout", "--detach", "FETCH_HEAD"], destination)
    elif not created:
        run(["git", "checkout", "--detach", "HEAD"], destination)
    run(["git", "submodule", "update", "--init", "--recursive", "--depth", "1"], destination)


def apply_dependency_patches(name: str, dependency: DependencyRepository,
                             destination: Path) -> None:
    for relative in dependency.patches:
        patch = ROOT / "algorithm" / name / relative
        if not patch.is_file():
            raise RuntimeError(f"dependency patch does not exist: {patch}")
        forward = subprocess.run(
            ["git", "apply", "--check", str(patch)], cwd=destination,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if forward.returncode == 0:
            run(["git", "apply", str(patch)], destination)
            continue
        reverse = subprocess.run(
            ["git", "apply", "--reverse", "--check", str(patch)], cwd=destination,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if reverse.returncode != 0:
            raise RuntimeError(f"{patch} does not apply to {destination}")
        print(f"{patch}: already applied")


def download(name: str, refresh: bool) -> None:
    clone(repository_for(name), download_path(name), refresh)
    for dependency in dependency_repositories(name):
        destination = ROOT / "algorithm" / name / "source" / dependency.directory
        clone(dependency.repository, destination, refresh)
        apply_dependency_patches(name, dependency, destination)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("algorithms", nargs="*", help="default: all supported algorithms")
    parser.add_argument("--refresh", action="store_true", help="fetch before checkout")
    args = parser.parse_args()
    try:
        for name in selected_algorithms(args.algorithms):
            download(name, args.refresh)
    except (ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
