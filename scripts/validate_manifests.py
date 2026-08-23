#!/usr/bin/env python3
"""Validate required dataset and algorithm manifest fields."""

from __future__ import annotations

import sys

from project import ROOT, SUPPORTED_ALGORITHMS, algorithm_manifest, load_yaml


def require(mapping: dict, fields: tuple[str, ...], location: str) -> None:
    missing = [field for field in fields if field not in mapping]
    if missing:
        raise ValueError(f"{location} is missing: {', '.join(missing)}")


def main() -> int:
    try:
        for name in SUPPORTED_ALGORITHMS:
            manifest = algorithm_manifest(name)
            require(manifest, ("name", "description", "authors", "license", "repository",
                               "dependencies", "paper", "sensors", "timing_stages"), name)
            unknown = set(manifest["sensors"]) - {"lidar", "imu", "camera", "gnss", "wheel_speed"}
            if unknown:
                raise ValueError(f"{name} contains unknown sensors: {sorted(unknown)}")
            config_path = ROOT / "algorithm" / name / "configs" / "default.yaml"
            config = load_yaml(config_path)
            if config.get("algorithm") != name:
                raise ValueError(
                    f"{config_path} algorithm must be {name!r}, got {config.get('algorithm')!r}"
                )
            for key in ("filter_size_scan_m", "filter_size_map_m", "map_voxel_size_m"):
                if key in config and (not isinstance(config[key], (int, float)) or config[key] <= 0):
                    raise ValueError(f"{config_path} {key} must be positive")
        for path in sorted((ROOT / "datasets").glob("*/manifest.yaml")):
            manifest = load_yaml(path)
            require(manifest, ("name", "download_url", "bags"), str(path))
        print("all manifests are valid")
        return 0
    except (KeyError, TypeError, ValueError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
