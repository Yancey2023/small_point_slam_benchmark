#!/usr/bin/env python3
"""Aggregate raw timing and CPU CSV files using only the Python standard library."""

from __future__ import annotations

import argparse
import csv
import math
import statistics
from pathlib import Path

from project import ROOT


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return math.nan
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def analyze(directory: Path) -> list[dict[str, object]]:
    timing_file = directory / "timings.csv"
    if not timing_file.is_file():
        return []
    stages: dict[str, list[float]] = {}
    with timing_file.open(newline="", encoding="utf-8") as stream:
        for row in csv.DictReader(stream):
            stages.setdefault(row["stage"], []).append(float(row["duration_ms"]))
    rows: list[dict[str, object]] = []
    for stage, values in sorted(stages.items()):
        rows.append({
            "stage": stage, "count": len(values), "total_ms": sum(values),
            "mean_ms": statistics.fmean(values), "median_ms": statistics.median(values),
            "p95_ms": percentile(values, 0.95), "min_ms": min(values), "max_ms": max(values),
        })
    output = directory / "analysis_summary.csv"
    with output.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]) if rows else ["stage"])
        writer.writeheader()
        writer.writerows(rows)
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("results", type=Path, nargs="?", default=ROOT / "results")
    args = parser.parse_args()
    directories = sorted({path.parent for path in args.results.rglob("timings.csv")})
    for directory in directories:
        rows = analyze(directory)
        print(f"{directory}: summarized {len(rows)} timing stages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

