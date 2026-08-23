"""Shared path and manifest helpers for repository scripts."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[1]
SUPPORTED_ALGORITHMS = (
    "fast_lio", "point_lio", "voxel_map", "voxel_map_with_imu", "super_lio",
    "kiss_icp", "faster_lio", "small_point_lio", "small_point_slam",
)


@dataclass(frozen=True)
class Repository:
    name: str
    url: str
    ref: str
    local_path: str | None = None
    local_path_env: str | None = None


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


def repository_for(name: str) -> Repository:
    raw = algorithm_manifest(name).get("repository")
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


def selected_algorithms(names: list[str]) -> list[str]:
    result = list(SUPPORTED_ALGORITHMS) if not names else names
    invalid = sorted(set(result) - set(SUPPORTED_ALGORITHMS))
    if invalid:
        raise ValueError("unsupported algorithms: " + ", ".join(invalid))
    return result


def download_path(name: str) -> Path:
    return ROOT / "algorithm_downloads" / name / repository_for(name).name


def source_path(name: str) -> Path:
    return ROOT / "algorithm" / name / "source" / repository_for(name).name


def patch_directory(name: str) -> Path:
    return ROOT / "algorithm" / name / "patchs"
