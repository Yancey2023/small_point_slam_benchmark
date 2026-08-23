"""Shared path and manifest helpers for repository scripts."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[1]
SUPPORTED_ALGORITHMS = ("fast_lio", "point_lio", "voxel_map", "super_lio")


@dataclass(frozen=True)
class Repository:
    name: str
    url: str
    ref: str


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
    repository = Repository(str(raw["name"]), str(raw["url"]), str(raw["ref"]))
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", repository.name):
        raise ValueError(f"unsafe repository name: {repository.name!r}")
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

