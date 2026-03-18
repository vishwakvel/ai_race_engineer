"""
Extract real circuit track coordinates from f1-circuits GeoJSON.

Downloads f1-circuits.geojson from GitHub (bacinger/f1-circuits, MIT License),
maps parquet circuit_ids to GeoJSON circuit ids, normalizes coordinates to SVG space,
and saves to backend/data/processed/circuit_track_maps.json.

Run:
    python -m backend.training.generate_track_maps
    python -m backend.training.generate_track_maps --force-refresh
"""

import argparse
import json
import os
import sys

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(_BACKEND_DIR, "data", "raw")
OUTPUT_PATH = os.path.join(_BACKEND_DIR, "data", "processed", "circuit_track_maps.json")
GEOJSON_URL = "https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson"
GEOJSON_CACHE = os.path.join(RAW_DIR, "f1_circuits_geojson.json")

DRS_ZONES: dict[str, int] = {
    "sakhir": 3,
    "bahrain": 3,
    "jeddah": 3,
    "melbourne": 2,
    "albert_park": 2,
    "imola": 1,
    "miami": 2,
    "monaco": 0,
    "monte_carlo": 0,
    "barcelona": 2,
    "catalunya": 2,
    "montréal": 1,
    "montreal": 1,
    "silverstone": 2,
    "spielberg": 2,
    "red_bull_ring": 2,
    "le_castellet": 2,
    "paul_ricard": 2,
    "budapest": 1,
    "hungaroring": 1,
    "spa-francorchamps": 2,
    "spa": 2,
    "zandvoort": 2,
    "monza": 2,
    "marina_bay": 3,
    "singapore": 3,
    "suzuka": 2,
    "lusail": 2,
    "austin": 2,
    "americas": 2,
    "mexico_city": 3,
    "rodriguez": 3,
    "são_paulo": 2,
    "sao_paulo": 2,
    "interlagos": 2,
    "las_vegas": 2,
    "vegas": 2,
    "yas_island": 2,
    "yas_marina": 2,
    "baku": 2,
    "shanghai": 2,
    "hockenheim": 2,
    "hockenheimring": 2,
    "istanbul": 2,
    "mugello": 2,
    "nürburgring": 2,
    "nurburgring": 2,
    "portimão": 2,
    "portimao": 2,
    "sochi": 2,
}
DEFAULT_DRS_ZONES = 2

PARQUET_TO_GEOJSON = {
    "austin": "us-2012",
    "americas": "us-2012",
    "baku": "az-2016",
    "barcelona": "es-1991",
    "catalunya": "es-1991",
    "budapest": "hu-1986",
    "hungaroring": "hu-1986",
    "hockenheim": "de-1929",
    "hockenheimring": "de-1929",
    "imola": "it-1953",
    "istanbul": "tr-2005",
    "jeddah": "sa-2021",
    "las_vegas": "us-2023",
    "vegas": "us-2023",
    "le_castellet": "fr-1969",
    "paul_ricard": "fr-1969",
    "lusail": "qa-2004",
    "marina_bay": "sg-2008",
    "singapore": "sg-2008",
    "melbourne": "au-1953",
    "albert_park": "au-1953",
    "mexico_city": "mx-1962",
    "rodriguez": "mx-1962",
    "miami": "us-2022",
    "monaco": "mc-1929",
    "monte_carlo": "mc-1929",
    "montréal": "ca-1978",
    "montreal": "ca-1978",
    "monza": "it-1922",
    "mugello": "it-1914",
    "nürburgring": "de-1927",
    "nurburgring": "de-1927",
    "portimão": "pt-2008",
    "portimao": "pt-2008",
    "sakhir": "bh-2002",
    "bahrain": "bh-2002",
    "shanghai": "cn-2004",
    "silverstone": "gb-1948",
    "sochi": "ru-2014",
    "spa-francorchamps": "be-1925",
    "spa": "be-1925",
    "spielberg": "at-1969",
    "red_bull_ring": "at-1969",
    "suzuka": "jp-1962",
    "são_paulo": "br-1940",
    "sao_paulo": "br-1940",
    "interlagos": "br-1940",
    "yas_island": "ae-2009",
    "yas_marina": "ae-2009",
    "zandvoort": "nl-1948",
}


def fetch_geojson(force_refresh: bool = False) -> dict:
    """Download or load cached GeoJSON."""
    if not force_refresh and os.path.exists(GEOJSON_CACHE):
        with open(GEOJSON_CACHE, encoding="utf-8") as f:
            return json.load(f)
    try:
        import requests
        resp = requests.get(GEOJSON_URL, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        os.makedirs(RAW_DIR, exist_ok=True)
        with open(GEOJSON_CACHE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return data
    except ImportError:
        print("requests is required. pip install requests")
        sys.exit(1)
    except Exception as e:
        print(f"Failed to fetch GeoJSON: {e}")
        if os.path.exists(GEOJSON_CACHE):
            with open(GEOJSON_CACHE, encoding="utf-8") as f:
                return json.load(f)
        raise


def parse_geojson(fc: dict) -> dict[str, list[list[float]]]:
    """Parse FeatureCollection into {circuit_id: [[lon, lat], ...]}."""
    out: dict[str, list[list[float]]] = {}
    for feat in fc.get("features", []):
        props = feat.get("properties", {})
        cid = props.get("id")
        if not cid:
            continue
        geom = feat.get("geometry")
        if not geom or geom.get("type") != "LineString":
            continue
        coords = geom.get("coordinates")
        if not coords or len(coords) < 2:
            continue
        out[cid] = [[float(c[0]), float(c[1])] for c in coords]
    return out


def normalize_to_svg(
    coords: list[list[float]], max_points: int = 500
) -> tuple[list[list[float]], str]:
    """
    Convert [lon, lat] to SVG [x, y].
    x = longitude, y = latitude (inverted for SVG).
    """
    if len(coords) < 2:
        return [], "0 0 400 280"
    x_vals = [c[0] for c in coords]
    y_vals = [c[1] for c in coords]
    x_min, x_max = min(x_vals), max(x_vals)
    y_min, y_max = min(y_vals), max(y_vals)
    x_range = x_max - x_min
    y_range = y_max - y_min
    if x_range <= 0:
        x_range = 1
    if y_range <= 0:
        y_range = 1
    scale = min(360.0 / x_range, 240.0 / y_range)
    points: list[list[float]] = []
    for i, (x, y) in enumerate(coords):
        x_n = (x - x_min) * scale + 20.0
        y_n = (y_max - y) * scale + 20.0
        points.append([round(x_n, 1), round(y_n, 1)])
    if len(points) > max_points:
        step = (len(points) - 1) / (max_points - 1) if max_points > 1 else 0
        indices = [int(round(i * step)) for i in range(max_points)]
        points = [points[min(i, len(points) - 1)] for i in indices]
    x_max_n = max(p[0] for p in points)
    y_max_n = max(p[1] for p in points)
    view_box = f"0 0 {int(x_max_n) + 20} {int(y_max_n) + 20}"
    return points, view_box


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force-refresh", action="store_true", help="Re-download GeoJSON")
    args = parser.parse_args()

    fc = fetch_geojson(force_refresh=args.force_refresh)
    geo_by_id = parse_geojson(fc)
    available = set(geo_by_id.keys())

    track_maps: dict[str, dict] = {}
    missing: list[str] = []

    for parquet_id, geojson_id in PARQUET_TO_GEOJSON.items():
        if geojson_id not in available:
            missing.append(f"{parquet_id} -> {geojson_id}")
            continue
        coords = geo_by_id[geojson_id]
        points, view_box = normalize_to_svg(coords)
        if not points:
            missing.append(f"{parquet_id} (empty coords)")
            continue
        name = next(
            (f["properties"].get("Location", parquet_id) for f in fc.get("features", [])
             if f.get("properties", {}).get("id") == geojson_id),
            parquet_id,
        )
        drs_zones = DRS_ZONES.get(parquet_id, DEFAULT_DRS_ZONES)
        entry = {
            "points": points,
            "viewBox": view_box,
            "point_count": len(points),
            "circuit_name": name,
            "drs_zones_count": drs_zones,
        }
        track_maps[parquet_id] = entry

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(track_maps, f, indent=2)

    print("\n--- Summary ---")
    for pid in sorted(track_maps.keys()):
        d = track_maps[pid]
        print(f"OK — {pid:25s} {d['viewBox']:15s} {d['point_count']} pts")
    if missing:
        print("\nMissing from GeoJSON:")
        for m in missing:
            print(f"  {m}")
    print(f"\nTotal: {len(track_maps)} circuits saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
