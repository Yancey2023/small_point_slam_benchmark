#!/usr/bin/env python3
"""Generate and apply portable Git patches for the standalone algorithm ports."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from project import (ROOT, download_path, patch_directory, repository_for,
                     selected_algorithms, source_excludes, source_path)


def copy_upstream(name: str, source: Path, destination: Path) -> None:
    excluded = {Path(item) for item in source_excludes(name)}

    def ignored(directory: str, entries: list[str]) -> list[str]:
        relative_directory = Path(directory).relative_to(source)
        return [
            entry for entry in entries
            if entry == ".git" or relative_directory / entry in excluded
        ]

    shutil.copytree(source, destination, ignore=ignored)


def patch_files(name: str) -> list[Path]:
    return sorted(patch_directory(name).glob("*.patch"))


def deleted_paths(patch: bytes) -> tuple[str, ...]:
    """Return full-file deletions that should be represented as source excludes."""
    result = subprocess.run(
        ["git", "apply", "--summary"], input=patch, cwd=ROOT,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors="replace").strip())
    paths = []
    for raw_line in result.stdout.decode(errors="replace").splitlines():
        line = raw_line.strip()
        if line.startswith("delete mode "):
            paths.append(line.split(" ", 3)[-1])
    return tuple(paths)


def require_compact_deletions(name: str, patch: bytes) -> None:
    deleted = deleted_paths(patch)
    if deleted:
        formatted = "\n  - ".join(deleted)
        raise RuntimeError(
            f"algorithm/{name} patch contains full-file deletions; add these "
            f"repository-relative paths to source_excludes:\n  - {formatted}")


def apply_one(name: str, force: bool, check_only: bool) -> None:
    upstream = download_path(name)
    destination = source_path(name)
    if not upstream.is_dir():
        raise RuntimeError(f"download first: {upstream}")
    patches = patch_files(name)
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Stage outside the project Git worktree. Otherwise `git apply` discovers
    # the parent repository and silently skips paths relative to this nested
    # temporary directory.
    with tempfile.TemporaryDirectory(prefix=f"{name}-") as temporary:
        staged = Path(temporary) / repository_for(name).name
        copy_upstream(name, upstream, staged)
        for patch in patches:
            require_compact_deletions(name, patch.read_bytes())
            check = subprocess.run(
                ["git", "apply", "--check", str(patch)], cwd=staged, text=True,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if check.returncode:
                raise RuntimeError(f"{patch} does not apply:\n{check.stderr.strip()}")
            if not check_only:
                subprocess.run(["git", "apply", str(patch)], cwd=staged, check=True)
        if check_only:
            print(f"{name}: {len(patches)} patch(es) apply cleanly")
            return
        if destination.exists():
            if not force:
                raise RuntimeError(f"patched source exists; pass --force: {destination}")
            shutil.rmtree(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(staged, destination)
        print(f"{name}: wrote {destination}")


def generate_one(name: str, output_name: str) -> None:
    upstream = download_path(name)
    adapted = source_path(name)
    if not upstream.is_dir() or not adapted.is_dir():
        raise RuntimeError(f"both upstream and adapted source must exist for {name}")
    with tempfile.TemporaryDirectory(prefix=f"patch-{name}-") as temporary:
        staging = Path(temporary)
        clean_upstream = staging / "upstream"
        clean_adapted = staging / "adapted"
        copy_upstream(name, upstream, clean_upstream)
        copy_upstream(name, adapted, clean_adapted)
        command = [
            "git", "diff", "--no-index", "--binary", "--src-prefix=a/",
            "--dst-prefix=b/", "--", "upstream", "adapted",
        ]
        result = subprocess.run(command, cwd=staging, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE)
    if result.returncode not in (0, 1):
        raise RuntimeError(result.stderr.decode(errors="replace"))
    patch = result.stdout.replace(b"a/upstream/", b"a/")
    patch = patch.replace(b"b/upstream/", b"b/")
    patch = patch.replace(b"a/adapted/", b"a/")
    patch = patch.replace(b"b/adapted/", b"b/")
    require_compact_deletions(name, patch)
    destination = patch_directory(name) / output_name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(patch)
    print(f"{name}: wrote {destination} ({len(patch)} bytes)")


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="action", required=True)
    apply_parser = subparsers.add_parser("apply")
    apply_parser.add_argument("algorithms", nargs="*")
    apply_parser.add_argument("--force", action="store_true")
    check_parser = subparsers.add_parser("check")
    check_parser.add_argument("algorithms", nargs="*")
    generate_parser = subparsers.add_parser("generate")
    generate_parser.add_argument("algorithms", nargs="*")
    generate_parser.add_argument("--output", default="0001-standalone-core-adapter.patch")
    args = parser.parse_args()
    try:
        for name in selected_algorithms(args.algorithms):
            if args.action == "generate":
                generate_one(name, args.output)
            else:
                apply_one(name, getattr(args, "force", False), args.action == "check")
    except (ValueError, RuntimeError, OSError, subprocess.CalledProcessError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
