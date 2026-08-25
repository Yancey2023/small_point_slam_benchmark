"""Shared path and manifest helpers for repository scripts."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[1]


def discover_algorithms() -> tuple[str, ...]:
    """Discover algorithm IDs from manifests instead of a maintained list."""
    return tuple(sorted(
        path.parent.name for path in (ROOT / "algorithm").glob("*/manifest.yaml")
        if path.parent.is_dir()
    ))


SUPPORTED_ALGORITHMS = discover_algorithms()


@dataclass(frozen=True)
class Repository:
    name: str
    url: str
    ref: str
    local_path: str | None = None
    local_path_env: str | None = None


@dataclass(frozen=True)
class DependencyRepository:
    repository: Repository
    directory: str
    patches: tuple[str, ...] = ()


def load_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as stream:
        value = yaml.safe_load(stream)
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a YAML mapping")
    return value


def algorithm_manifest(name: str) -> dict[str, Any]:
    if name not in SUPPORTED_ALGORITHMS:
        raise ValueError(f"unsupported algorithm: {name}")
    return load_yaml(ROOT / "algorithm" / name / "manifest.yaml")


def source_owner(name: str) -> str:
    """Resolve an algorithm profile that reuses another adapter source tree."""
    owner = str(algorithm_manifest(name).get("shared_source", name))
    if owner not in SUPPORTED_ALGORITHMS:
        raise ValueError(f"{name} has unsupported shared_source: {owner}")
    return owner


def repository_for(name: str) -> Repository:
    owner = source_owner(name)
    raw = algorithm_manifest(owner).get("repository")
    if not isinstance(raw, dict):
        raise ValueError(f"algorithm/{name}/manifest.yaml has no repository mapping")
    repository = Repository(
        str(raw["name"]), str(raw.get("url", "")), str(raw["ref"]),
        str(raw["local_path"]) if raw.get("local_path") else None,
        str(raw["local_path_env"]) if raw.get("local_path_env") else None,
    )
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", repository.name):
        raise ValueError(f"unsafe repository name: {repository.name!r}")
    if repository.local_path_env and not re.fullmatch(
            r"[A-Za-z_][A-Za-z0-9_]*", repository.local_path_env):
        raise ValueError(f"unsafe environment variable: {repository.local_path_env!r}")
    if not repository.url and not repository.local_path and not repository.local_path_env:
        raise ValueError(f"algorithm/{name}/manifest.yaml repository needs url or local_path")
    return repository


def dependency_repositories(name: str) -> tuple[DependencyRepository, ...]:
    owner = source_owner(name)
    raw_dependencies = algorithm_manifest(owner).get("dependencies", [])
    if not isinstance(raw_dependencies, list):
        raise ValueError(f"algorithm/{name}/manifest.yaml dependencies must be a list")
    result: list[DependencyRepository] = []
    for raw in raw_dependencies:
        if not isinstance(raw, dict):
            raise ValueError(f"algorithm/{name}/manifest.yaml has an invalid dependency")
        # Existing manifests may list system/package dependencies for
        # documentation only. A pinned ref opts a dependency into source
        # download and patch management.
        if "ref" not in raw:
            if "directory" in raw or "patches" in raw:
                raise ValueError(
                    f"algorithm/{name}/manifest.yaml managed dependency needs ref")
            continue
        url = str(raw.get("url", ""))
        directory = str(raw.get("directory", Path(url.removesuffix(".git")).name))
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", directory):
            raise ValueError(f"unsafe dependency directory: {directory!r}")
        patches = raw.get("patches", [])
        if not isinstance(patches, list) or not all(isinstance(item, str) for item in patches):
            raise ValueError(f"invalid dependency patches for {directory}")
        for patch in patches:
            path = Path(patch)
            if path.is_absolute() or ".." in path.parts:
                raise ValueError(f"unsafe dependency patch: {patch!r}")
        result.append(DependencyRepository(
            Repository(str(raw["name"]), url, str(raw["ref"])),
            directory, tuple(patches)))
    return tuple(result)


def selected_algorithms(names: list[str]) -> list[str]:
    result = list(SUPPORTED_ALGORITHMS) if not names else names
    invalid = sorted(set(result) - set(SUPPORTED_ALGORITHMS))
    if invalid:
        raise ValueError("unsupported algorithms: " + ", ".join(invalid))
    return result


def download_path(name: str) -> Path:
    owner = source_owner(name)
    return ROOT / "algorithm_downloads" / owner / repository_for(owner).name


def source_path(name: str) -> Path:
    owner = source_owner(name)
    return ROOT / "algorithm" / owner / "source" / repository_for(owner).name


def patch_directory(name: str) -> Path:
    return ROOT / "algorithm" / source_owner(name) / "patchs"
