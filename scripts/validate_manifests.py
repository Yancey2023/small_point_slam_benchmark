#!/usr/bin/env python3
"""Validate required dataset and algorithm manifest fields."""

from __future__ import annotations

import sys

from project import (ROOT, SUPPORTED_ALGORITHMS, algorithm_manifest,
                     dependency_repositories, load_yaml)


def require(mapping: dict, fields: tuple[str, ...], location: str) -> None:
    missing = [field for field in fields if field not in mapping]
    if missing:
        raise ValueError(f"{location} is missing: {', '.join(missing)}")


def reject_embedded_extrinsics(value: object, location: str) -> None:
    forbidden = {"extrinsic_t", "extrinsic_r", "extrint", "extrinr"}
    if isinstance(value, dict):
        for key, child in value.items():
            if str(key).lower() in forbidden:
                raise ValueError(
                    f"{location} must receive sensor extrinsics from the dataset "
                    f"manifest during initialization; remove {key!r}"
                )
            reject_embedded_extrinsics(child, location)
    elif isinstance(value, list):
        for child in value:
            reject_embedded_extrinsics(child, location)


def reject_topic_bindings(value: object, location: str) -> None:
    """Keep rosbag transport details in dataset manifests and benchmark core."""
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = str(key).lower()
            if normalized in {"topic", "topics"} or normalized.endswith(
                ("_topic", "_topics")
            ):
                raise ValueError(
                    f"{location} must receive sensor samples from benchmark core; "
                    f"remove topic binding {key!r}"
                )
            reject_topic_bindings(child, location)
    elif isinstance(value, list):
        for child in value:
            reject_topic_bindings(child, location)


def main() -> int:
    try:
        for name in SUPPORTED_ALGORITHMS:
            manifest = algorithm_manifest(name)
            require(manifest, ("name", "description", "authors", "license", "repository",
                               "dependencies", "paper", "sensors", "timing_stages"), name)
            unknown = set(manifest["sensors"]) - {"lidar", "imu", "camera", "gnss", "wheel_speed"}
            if unknown:
                raise ValueError(f"{name} contains unknown sensors: {sorted(unknown)}")
            for dependency in dependency_repositories(name):
                for relative_patch in dependency.patches:
                    patch = ROOT / "algorithm" / name / relative_patch
                    if not patch.is_file():
                        raise ValueError(f"{name} dependency patch does not exist: {patch}")
            reject_topic_bindings(manifest, str(ROOT / "algorithm" / name / "manifest.yaml"))
            config_path = ROOT / "algorithm" / name / "configs" / "default.yaml"
            config = load_yaml(config_path)
            if config.get("algorithm") != name:
                raise ValueError(
                    f"{config_path} algorithm must be {name!r}, got {config.get('algorithm')!r}"
                )
            reject_embedded_extrinsics(config, str(config_path))
            reject_topic_bindings(config, str(config_path))
            for key in ("filter_size_scan_m", "filter_size_map_m", "map_voxel_size_m"):
                if key in config and (not isinstance(config[key], (int, float)) or config[key] <= 0):
                    raise ValueError(f"{config_path} {key} must be positive")
        for path in sorted((ROOT / "datasets").glob("*/manifest.yaml")):
            manifest = load_yaml(path)
            require(manifest, ("name", "download_url", "bags"), str(path))
            if not isinstance(manifest["bags"], list) or not manifest["bags"]:
                raise ValueError(f"{path} bags must be a non-empty list")
            for index, bag in enumerate(manifest["bags"]):
                location = f"{path} bags[{index}]"
                require(bag, ("name", "path", "sensors"), location)
                maximum_position = bag.get("max_output_position_m", 2000)
                if (not isinstance(maximum_position, (int, float))
                        or isinstance(maximum_position, bool) or maximum_position <= 0):
                    raise ValueError(f"{location} max_output_position_m must be a positive number")
                inventory = bag.get("sensor_inventory", bag["sensors"])
                if not isinstance(inventory, list) or not inventory:
                    raise ValueError(f"{location} sensor_inventory must be a non-empty list")
                inventory_ids: set[int] = set()
                inventory_topics: set[str] = set()
                for sensor_index, sensor in enumerate(inventory):
                    sensor_location = f"{location} sensor_inventory[{sensor_index}]"
                    if not isinstance(sensor, dict):
                        raise ValueError(f"{sensor_location} must be a mapping")
                    require(sensor, ("id", "name", "type", "enabled", "topic",
                                     "message_type", "calibration"),
                            sensor_location)
                    if sensor["type"] not in {"lidar", "imu", "camera", "gnss", "wheel_speed"}:
                        raise ValueError(f"{sensor_location} has unsupported type {sensor['type']!r}")
                    priority = sensor.get("priority", 0)
                    if not isinstance(priority, int) or isinstance(priority, bool):
                        raise ValueError(f"{sensor_location} priority must be an integer")
                    if not isinstance(sensor["enabled"], bool):
                        raise ValueError(f"{sensor_location} enabled must be a boolean")
                    if sensor["id"] in inventory_ids:
                        raise ValueError(f"{location} has duplicate sensor inventory id {sensor['id']}")
                    if sensor["topic"] in inventory_topics:
                        raise ValueError(
                            f"{location} has duplicate sensor inventory topic {sensor['topic']!r}"
                        )
                    inventory_ids.add(sensor["id"])
                    inventory_topics.add(sensor["topic"])
                ground_truth = bag.get("ground_truth")
                if ground_truth is not None:
                    if not isinstance(ground_truth, dict):
                        raise ValueError(f"{location} ground_truth must be a mapping")
                    require(ground_truth, ("path", "format"), f"{location} ground_truth")
                    if ground_truth["format"] == "end_pose":
                        # A single true end pose (rotation matrix + translation
                        # relative to the start); no timestamp matching config.
                        continue
                    if ground_truth["format"] != "tum":
                        raise ValueError(
                            f"{location} ground truth format must be 'tum' or 'end_pose'"
                        )
                    maximum = ground_truth.get("max_time_difference_ms", 100)
                    if not isinstance(maximum, (int, float)) or maximum <= 0:
                        raise ValueError(
                            f"{location} ground_truth max_time_difference_ms must be positive"
                        )
        print("all manifests are valid")
        return 0
    except (KeyError, TypeError, ValueError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
