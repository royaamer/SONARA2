#!/usr/bin/env python3
"""Create verified month-by-month map statistics from existing daily OSCAR web exports.

No synthetic ocean measurements, no new NetCDF downloads, no changes to the music.
Output is used only for the optional Earthsonic "Compare over time" feature.

Usage (run from EarthJukeBox root):
    python scripts/build_oscar_spacetime.py --year 2023

Requirements: numpy (already required by the OSCAR export scripts).
"""
from __future__ import annotations

import argparse
import calendar
import json
from pathlib import Path

import numpy as np

SOURCE = "NASA PO.DAAC OSCAR_L4_OC_FINAL_V2.0"
GRID_KEYS = ("width", "height", "lonStart", "lonStep", "latStart", "latStep")


def verify_manifest(path: Path, year: int):
    """Return (month, manifest, expected_dates) or raise a useful error."""
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("source") != SOURCE or manifest.get("units") != "m/s":
        raise ValueError("not the expected OSCAR velocity product (m/s)")
    days = manifest.get("days")
    if not isinstance(days, list) or not days:
        raise ValueError("missing daily file index")
    first = days[0].get("date", "")
    month = first[:7]
    if (len(first) != 10 or month != f"{year}-{first[5:7]}"
            or not first[5:7].isdigit() or not 1 <= int(first[5:7]) <= 12):
        raise ValueError("not a date within the requested year")
    count = calendar.monthrange(year, int(month[5:]))[1]
    dates = [f"{month}-{day:02d}" for day in range(1, count + 1)]
    if [day.get("date") for day in days] != dates:
        raise ValueError("month is incomplete, duplicated, or has non-consecutive days")
    for day in days:
        if day.get("file") != f"{day['date']}.json":
            raise ValueError("unexpected daily JSON filename")
        if not (path.parent / day["file"]).is_file():
            raise ValueError(f"missing {day['file']}")
    grid = manifest.get("grid", {})
    if (not all(isinstance(grid.get(k), (int, float)) for k in GRID_KEYS)
            or grid["width"] < 2 or grid["height"] < 2
            or grid["lonStep"] <= 0 or grid["latStep"] <= 0):
        raise ValueError("invalid coordinate grid")
    return month, manifest, dates


def one_month(manifest_path: Path, manifest: dict):
    grid = manifest["grid"]
    n = int(grid["width"]) * int(grid["height"])
    sum_u = np.zeros(n, dtype=np.float64)
    sum_v = np.zeros(n, dtype=np.float64)
    sum_speed = np.zeros(n, dtype=np.float64)
    valid_days = np.zeros(n, dtype=np.int16)
    for entry in manifest["days"]:
        item = json.loads((manifest_path.parent / entry["file"]).read_text(encoding="utf-8"))
        if item.get("date") != entry["date"]:
            raise ValueError("daily JSON date does not match manifest")
        if not isinstance(item.get("u"), list) or not isinstance(item.get("v"), list):
            raise ValueError("missing U/V arrays")
        if len(item["u"]) != n or len(item["v"]) != n:
            raise ValueError("U/V array does not match manifest grid")
        u = np.asarray(item["u"], dtype=np.float64)
        v = np.asarray(item["v"], dtype=np.float64)
        good = np.isfinite(u) & np.isfinite(v)
        sum_u[good] += u[good]
        sum_v[good] += v[good]
        sum_speed[good] += np.hypot(u[good], v[good])
        valid_days[good] += 1
    valid = valid_days > 0

    def encode(mean_values):
        values = np.zeros(n, dtype=np.float64)
        np.divide(mean_values, valid_days, out=values, where=valid)
        return [round(float(v), 4) if yes else None for v, yes in zip(values, valid)]

    return {
        "month": manifest["days"][0]["date"][:7],
        "source": SOURCE,
        "units": "m/s",
        "observationDays": len(manifest["days"]),
        "grid": {key: grid[key] for key in GRID_KEYS},
        "validDays": valid_days.astype(int).tolist(),
        "meanSpeedMps": encode(sum_speed),
        "meanUMps": encode(sum_u),
        "meanVMps": encode(sum_v),
    }


def build(web_root: Path, output: Path, year: int):
    candidates = sorted(web_root.glob(f"{year}-??/manifest.json"))
    # Backwards compatibility: the first November export may live at web/manifest.json.
    legacy = web_root / "manifest.json"
    if legacy.is_file():
        candidates.append(legacy)
    if not candidates:
        raise FileNotFoundError(f"No OSCAR web manifests found in {web_root}")
    output.mkdir(parents=True, exist_ok=True)
    summary = {}
    grid = None
    seen = set()
    for path in candidates:
        try:
            month, manifest, _ = verify_manifest(path, year)
            if month in seen:
                print(f"SKIP {path}: duplicate month {month}")
                continue
            candidate_grid = {key: manifest["grid"][key] for key in GRID_KEYS}
            if grid is not None and candidate_grid != grid:
                raise ValueError("incompatible grid: re-export with matching stride and coordinates")
            item = one_month(path, manifest)
            (output / f"{month}.json").write_text(
                json.dumps(item, separators=(",", ":"), allow_nan=False), encoding="utf-8"
            )
            summary[month] = {
                "month": month,
                "file": f"{month}.json",
                "observationDays": item["observationDays"],
                "validGridCells": sum(v > 0 for v in item["validDays"]),
            }
            grid = candidate_grid
            seen.add(month)
            print(f"READY {month}: {item['observationDays']} actual daily files")
        except (ValueError, KeyError, TypeError, OSError, json.JSONDecodeError) as error:
            print(f"SKIP {path}: {error}")
    if not summary:
        raise RuntimeError("No complete, compatible OSCAR months; comparison data was not generated")
    index = {
        "schemaVersion": 1,
        "source": SOURCE,
        "year": year,
        "grid": grid,
        "statistic": "At each exported grid cell: arithmetic mean of sqrt(u^2 + v^2) across valid daily OSCAR fields. Average U and V are separate vector components; direction reflects the mean vector.",
        "missingRule": "Missing daily U/V pairs are excluded; months lacking a full set of daily exports are absent, not zero.",
        "months": [summary[key] for key in sorted(summary)],
    }
    (output / "months.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
    print(f"Wrote {output/'months.json'} with {len(summary)}/12 supported months")
    if len(summary) < 12:
        print("NOTE: Other months will appear unavailable in the comparison UI.")
    return index


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--web-root", type=Path, default=Path("data/processed/oscar/web"))
    p.add_argument("--output", type=Path, default=Path("data/processed/oscar/comparison"))
    p.add_argument("--year", type=int, default=2023)
    args = p.parse_args()
    build(args.web_root, args.output, args.year)


if __name__ == "__main__":
    main()
