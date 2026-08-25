#!/usr/bin/env python3
"""Run one standard algorithm executable and preserve its raw CSV output."""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

from project import ROOT, algorithm_manifest, load_yaml, selected_algorithms


def path_segment(value: object) -> str:
    safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", str(value).strip())
    return safe or "unnamed"


def executable_path(build: Path, algorithm: str) -> Path:
    suffix = ".exe" if os.name == "nt" else ""
    candidates = (
        build / f"{algorithm}_benchmark{suffix}",
        build / "bin" / f"{algorithm}_benchmark{suffix}",
        build / "Release" / f"{algorithm}_benchmark{suffix}",
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    recursive_matches = sorted(build.rglob(f"{algorithm}_benchmark{suffix}"))
    if len(recursive_matches) == 1:
        return recursive_matches[0]
    if len(recursive_matches) > 1:
        raise RuntimeError(
            f"multiple {algorithm}_benchmark executables found under {build}: "
            + ", ".join(str(path) for path in recursive_matches)
        )
    raise FileNotFoundError(f"cannot find {algorithm}_benchmark under {build}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("algorithm", choices=selected_algorithms([]))
    parser.add_argument("dataset_manifest", type=Path)
    parser.add_argument("bag")
    parser.add_argument("--build-dir", type=Path, default=ROOT / "build" / "algorithms")
    parser.add_argument("--config", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--run-mode", choices=("full_speed", "realtime"),
                        default="full_speed")
    args = parser.parse_args()
    try:
        dataset = load_yaml(args.dataset_manifest)
        bags = dataset.get("bags")
        if not isinstance(bags, list):
            raise ValueError("dataset manifest bags must be a list")
        bag = next((item for item in bags
                    if isinstance(item, dict) and str(item.get("name")) == args.bag), None)
        if bag is None:
            raise ValueError(f"bag not found in dataset manifest: {args.bag}")
        algorithm_name = algorithm_manifest(args.algorithm)["name"]
        result_name = "-".join((
            path_segment(dataset["name"]),
            path_segment(bag["name"]),
            path_segment(algorithm_name),
        ))
        output = args.output or ROOT / "results" / result_name
        output.mkdir(parents=True, exist_ok=True)
        executable = executable_path(args.build_dir, args.algorithm)
        config = args.config or ROOT / "algorithm" / args.algorithm / "configs" / "default.yaml"
        command = [str(executable), "--dataset-manifest", str(args.dataset_manifest),
                   "--bag", args.bag, "--config", str(config), "--output", str(output)]
        command.extend(["--run-mode", args.run_mode])
        print("+", " ".join(command))
        return subprocess.run(command).returncode
    except (KeyError, ValueError, OSError, RuntimeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
