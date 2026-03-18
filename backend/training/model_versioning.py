"""Timestamped model copies and model_versions.json updates."""

import json
import os
import shutil
from datetime import datetime

MODEL_VERSIONS = "model_versions.json"


def update_model_versions(models_dir: str, component: str, filename: str, metrics: dict | None = None) -> None:
    """Append version entry and set active."""
    path = os.path.join(models_dir, MODEL_VERSIONS)
    data = {"active": {}, "history": []}
    if os.path.exists(path):
        try:
            with open(path) as f:
                data = json.load(f)
        except Exception:
            pass
    if "history" not in data:
        data["history"] = []
    if "active" not in data:
        data["active"] = {}
    entry = {
        "ts": datetime.utcnow().strftime("%Y%m%d_%H%M%S"),
        "file": filename,
        "metrics": metrics or {},
    }
    data["history"].append({"component": component, **entry})
    data["active"][component] = {"file": filename, "ts": entry["ts"], "metrics": metrics or {}}
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def save_timestamped_copy(models_dir: str, src_name: str, ts: str | None = None) -> str | None:
    """Copy models_dir/src_name to src_name with ts suffix. Returns dest basename or None."""
    ts = ts or datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    src = os.path.join(models_dir, src_name)
    if not os.path.isfile(src):
        return None
    base, ext = os.path.splitext(src_name)
    dest_name = f"{base}_{ts}{ext}"
    dest = os.path.join(models_dir, dest_name)
    shutil.copy2(src, dest)
    return dest_name
