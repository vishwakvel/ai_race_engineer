"""
Clean raw Leclerc lap CSVs and produce leclerc_career_laps.parquet.
Run: python -m backend.training.clean_data
"""

import os
import json
import glob
import pandas as pd
import numpy as np
from datetime import datetime

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(_BACKEND_DIR, "data", "raw")
PROCESSED_DIR = os.path.join(_BACKEND_DIR, "data", "processed")
OUTPUT_PARQUET = os.path.join(PROCESSED_DIR, "leclerc_career_laps.parquet")
SUMMARY_JSON = os.path.join(PROCESSED_DIR, "dataset_summary.json")

COMPOUND_MAP = {
    "SOFT": 0,
    "SUPERSOFT": 0,
    "ULTRASOFT": 0,
    "HYPERSOFT": 0,
    "MEDIUM": 1,
    "HARD": 2,
    "INTERMEDIATE": 3,
    "INTER": 3,
    "WET": 4,
}


def main() -> None:
    os.makedirs(PROCESSED_DIR, exist_ok=True)

    # Step 1 — Consolidate raw CSVs
    pattern = os.path.join(RAW_DIR, "lec_*.csv")
    files = sorted(glob.glob(pattern))
    if not files:
        print("No lec_*.csv files found in", RAW_DIR)
        dfs = [pd.DataFrame()]
    else:
        dfs = []
        for f in files:
            try:
                df = pd.read_csv(f)
                dfs.append(df)
            except Exception as e:
                print(f"Skip {f}: {e}")
        if not dfs:
            dfs = [pd.DataFrame()]

    df = pd.concat(dfs, ignore_index=True)
    print(f"Total rows after concat: {len(df)}")
    if df.empty:
        df = pd.DataFrame(columns=[
            "year", "round", "circuit_id", "lap_number", "lap_time_seconds",
            "compound", "compound_str", "tyre_age", "position", "gap_ahead_seconds",
            "gap_behind_seconds", "fuel_load_kg", "track_temp_celsius", "air_temp_celsius",
            "rainfall", "track_temp_delta", "safety_car_active", "is_inlap", "is_outlap",
            "next_compound", "pitted_this_lap", "stint_number", "laps_remaining",
            "track_evolution_index", "session_id",
            "exclude_from_lstm_training", "exclude_from_sc_training",
        ])
        df.to_parquet(OUTPUT_PARQUET, index=False)
        with open(SUMMARY_JSON, "w") as f:
            json.dump({"total_rows": 0, "last_update": datetime.utcnow().isoformat() + "Z"}, f, indent=2)
        return

    # Normalise column names (raw may have track_temp vs track_temp_celsius)
    if "track_temp" in df.columns and "track_temp_celsius" not in df.columns:
        df["track_temp_celsius"] = df["track_temp"]
    if "air_temp" in df.columns and "air_temp_celsius" not in df.columns:
        df["air_temp_celsius"] = df["air_temp"]
    if "tyre_life" in df.columns and "tyre_age" not in df.columns:
        df["tyre_age"] = df["tyre_life"]

    # Step 2 — Rainfall (preserve from raw; 0 = dry, 1 = wet)
    if "rainfall" not in df.columns:
        df["rainfall"] = 0
    df["rainfall"] = pd.to_numeric(df["rainfall"], errors="coerce").fillna(0).astype(int)
    df.loc[df["rainfall"] != 0, "rainfall"] = 1  # Normalise to binary 0/1

    # Step 2b — Track temp delta within session only (resets at session boundary)
    if "track_temp_celsius" not in df.columns and "track_temp" in df.columns:
        df["track_temp_celsius"] = df["track_temp"]
    df["track_temp_celsius"] = pd.to_numeric(df["track_temp_celsius"], errors="coerce")
    df["track_temp_delta"] = 0.0
    df = df.sort_values(["year", "round", "lap_number"]).reset_index(drop=True)
    df["session_id"] = df["year"].astype(str) + "_" + df["round"].astype(int).astype(str).str.zfill(2) + "_R"
    for sid, g in df.groupby("session_id", sort=False):
        g = g.sort_values("lap_number")
        prev_temp = None
        for i in g.index.tolist():
            curr = df.loc[i, "track_temp_celsius"]
            if pd.notna(curr) and prev_temp is not None:
                df.loc[i, "track_temp_delta"] = float(curr) - float(prev_temp)
            prev_temp = curr if pd.notna(curr) else prev_temp

    # Wind speed (km/h typical from FastF1)
    if "wind_speed" not in df.columns:
        df["wind_speed"] = 0.0
    df["wind_speed"] = pd.to_numeric(df["wind_speed"], errors="coerce").fillna(0.0)

    # Fresh tyre flag (from collect_data / FastF1 FreshTyre)
    if "fresh_tyre" not in df.columns:
        df["fresh_tyre"] = 1
    df["fresh_tyre"] = pd.to_numeric(df["fresh_tyre"], errors="coerce").fillna(1).astype(int).clip(0, 1)

    # Raw track status for VSC ratio (preserve string e.g. "4", "6", "12|4")
    if "track_status" not in df.columns:
        df["track_status"] = ""
    df["track_status"] = df["track_status"].astype(str).fillna("")

    # Step 2c — Lap time reasonableness
    dry = (df["rainfall"] == 0) | df["rainfall"].isna()
    wet = ~dry
    lt = df["lap_time_seconds"].astype(float)
    df.loc[dry & ((lt < 55.0) | (lt > 200.0)), "lap_time_seconds"] = np.nan
    df.loc[wet & ((lt < 65.0) | (lt > 250.0)), "lap_time_seconds"] = np.nan

    # Step 3 — Encode compounds
    df["compound_str"] = df["compound"].astype(str).str.strip().str.upper()

    def map_compound(s: str) -> int:
        if s in COMPOUND_MAP:
            return COMPOUND_MAP[s]
        if "SOFT" in s or "SUPER" in s or "ULTRA" in s or "HYPER" in s:
            return 0
        if "MEDIUM" in s:
            return 1
        if "HARD" in s:
            return 2
        if "INTER" in s:
            return 3
        if "WET" in s:
            return 4
        return 0

    df["compound"] = df["compound_str"].map(map_compound).fillna(0).astype(int)

    # Step 4 — Fuel load
    df["fuel_load_kg"] = (110.0 - df["lap_number"] * 1.6).clip(lower=0.0)

    # Step 5 — Stint number
    df["stint_number"] = 1
    for (year, round_val), g in df.groupby(["year", "round"]):
        pit_in = g["pit_in"] if "pit_in" in g.columns else pd.Series(False, index=g.index)
        if pit_in.dtype == object:
            pit_in = pit_in.fillna(False).astype(bool)
        stints = 1
        stint_col = np.ones(len(g), dtype=int)
        for i in range(1, len(g)):
            if pit_in.iloc[i - 1]:
                stints += 1
            stint_col[i] = stints
        df.loc[g.index, "stint_number"] = stint_col

    # Step 6 — Inlap / outlap flags
    df["is_inlap"] = (df["pit_in"] == True) | (df["pit_in"] == 1) if "pit_in" in df.columns else 0
    df["is_outlap"] = (df["pit_out"] == True) | (df["pit_out"] == 1) if "pit_out" in df.columns else 0
    df["is_inlap"] = df["is_inlap"].astype(int)
    df["is_outlap"] = df["is_outlap"].astype(int)

    # Step 7 — Next compound
    df["next_compound"] = np.nan
    for (year, round_val), g in df.groupby(["year", "round"]):
        idx = g.index
        for i in range(len(g) - 1):
            if df.loc[idx[i], "is_inlap"] == 1:
                df.loc[idx[i], "next_compound"] = df.loc[idx[i + 1], "compound"]
    df["next_compound"] = df["next_compound"].fillna(-1).astype(int)
    df.loc[df["next_compound"] < 0, "next_compound"] = np.nan

    # Step 8 — Pitted this lap
    df["pitted_this_lap"] = df["is_inlap"]

    # Step 9 — Safety car flag (numeric: 4=SC, 6=VSC; 41/124/126 = compound codes incl. SC/VSC)
    if "track_status" in df.columns:
        track_status_numeric = pd.to_numeric(df["track_status"], errors="coerce").fillna(0)
        df["safety_car_active"] = track_status_numeric.isin([4, 6, 41, 124, 126]).astype(int)
    else:
        df["safety_car_active"] = 0

    # Step 10 — Laps remaining
    total_laps = df.groupby(["year", "round"])["lap_number"].transform("max")
    df["laps_remaining"] = (total_laps - df["lap_number"]).astype(int)

    # Step 10b — Track evolution index (rubber buildup, 0–1)
    def compute_track_evolution(lap_number: float, total: float) -> float:
        progress = lap_number / max(total, 1)
        return 0.85 / (1 + np.exp(-12 * (progress - 0.25)))

    df["track_evolution_index"] = df.apply(
        lambda row: compute_track_evolution(
            row["lap_number"],
            row["lap_number"] + row["laps_remaining"],
        ),
        axis=1,
    )

    # Step 11 — Gap clipping
    df["gap_ahead_seconds"] = df["gap_ahead_seconds"].fillna(0).clip(0.0, 120.0)
    df["gap_behind_seconds"] = df["gap_behind_seconds"].fillna(0).clip(0.0, 120.0)
    df.loc[df["position"] == 1, "gap_ahead_seconds"] = 0.0

    # Step 12 — Session ID (already set above; ensure consistent)
    df["session_id"] = df["year"].astype(str) + "_" + df["round"].astype(int).astype(str).str.zfill(2) + "_R"

    # Field tyre stress index (XGB / strategy)
    COMPOUND_HARDNESS = {0: 0, 1: 1, 2: 2, 3: 1.5, 4: 1}
    df["tyre_hardness"] = df["compound"].map(COMPOUND_HARDNESS).fillna(1)
    df["field_tyre_stress_index"] = df["tyre_age"] / (df["tyre_hardness"] + 1)

    # Step 13 — Drop rows with NaN lap_time_seconds
    df = df[df["lap_time_seconds"].notna()].copy()

    # Step 14 — Training mask columns
    df["exclude_from_lstm_training"] = (
        (df["is_inlap"] == 1) | (df["is_outlap"] == 1) |
        (df["safety_car_active"] == 1) | (df["lap_number"] == 1)
    ).astype(int)
    df["exclude_from_sc_training"] = 0

    # Per-circuit lap time normalization (for LSTM)
    circuit_stats = (
        df[df["exclude_from_lstm_training"] == 0]
        .groupby("circuit_id")["lap_time_seconds"]
        .agg(["mean", "std"])
        .rename(columns={"mean": "circuit_lt_mean", "std": "circuit_lt_std"})
    )
    circuit_stats["circuit_lt_std"] = circuit_stats["circuit_lt_std"].fillna(5.0).clip(lower=1.0)

    df = df.join(circuit_stats, on="circuit_id")
    glob_m = float(df["lap_time_seconds"].mean())
    glob_s = max(float(df["lap_time_seconds"].std()) or 5.0, 1.0)
    df["circuit_lt_mean"] = df["circuit_lt_mean"].fillna(glob_m)
    df["circuit_lt_std"] = df["circuit_lt_std"].fillna(glob_s).clip(lower=1.0)
    df["lap_time_normalized"] = (df["lap_time_seconds"] - df["circuit_lt_mean"]) / (
        df["circuit_lt_std"] + 1e-8
    )

    _models_dir = os.path.join(_BACKEND_DIR, "data", "models")
    os.makedirs(_models_dir, exist_ok=True)
    circuit_stats_path = os.path.join(_models_dir, "circuit_lap_stats.json")
    circuit_stats_records = []
    for cid in df["circuit_id"].dropna().unique():
        row0 = df[df["circuit_id"] == cid].iloc[0]
        circuit_stats_records.append({
            "circuit_id": str(cid),
            "circuit_lt_mean": float(row0["circuit_lt_mean"]),
            "circuit_lt_std": float(row0["circuit_lt_std"]),
        })
    with open(circuit_stats_path, "w") as f:
        json.dump(circuit_stats_records, f, indent=2)
    print(f"[clean] Circuit lap stats saved for {len(circuit_stats_records)} circuits")

    # circuit_pit_loss_seconds
    pit_losses: dict[str, list[float]] = {}
    for (_, _), session_df in df.groupby(["year", "round"]):
        inlaps = session_df[session_df["is_inlap"] == 1]["lap_time_seconds"]
        clean_laps = session_df[(session_df["exclude_from_lstm_training"] == 0)]["lap_time_seconds"]
        if len(inlaps) > 0 and len(clean_laps) > 0:
            pit_loss = float(inlaps.mean() - clean_laps.median())
            cid = str(session_df["circuit_id"].iloc[0])
            pit_losses.setdefault(cid, []).append(pit_loss)
    circuit_pit_loss = {k: float(np.mean(v)) for k, v in pit_losses.items()}
    for k in circuit_pit_loss:
        circuit_pit_loss[k] = float(np.clip(circuit_pit_loss[k], 12.0, 45.0))
    pit_path = os.path.join(_models_dir, "circuit_pit_loss.json")
    with open(pit_path, "w") as f:
        json.dump(circuit_pit_loss, f, indent=2)
    print(f"[clean] circuit_pit_loss.json ({len(circuit_pit_loss)} circuits)")

    midfield = df[(df["position"] >= 5) & (df["position"] <= 15)]
    battle_intensity = midfield.groupby("circuit_id")["gap_behind_seconds"].mean()
    battle_intensity_dict = {str(k): float(v) for k, v in battle_intensity.fillna(2.2).items()}
    with open(os.path.join(_models_dir, "circuit_battle_intensity.json"), "w") as f:
        json.dump(battle_intensity_dict, f, indent=2)

    def _ts_parts(ts) -> list[str]:
        s = str(ts).strip()
        if not s:
            return []
        return [p.strip() for p in s.split("|") if p.strip()]

    vsc_ratio: dict[str, float] = {}
    sc_events = df[df["safety_car_active"] == 1]
    if len(sc_events) > 0 and "track_status" in sc_events.columns:
        for cid, group in sc_events.groupby("circuit_id"):
            vsc_count = 0
            sc_count = 0
            for ts in group["track_status"]:
                parts = _ts_parts(ts)
                if "6" in parts:
                    vsc_count += 1
                elif "4" in parts:
                    sc_count += 1
                else:
                    if any("6" in p for p in parts):
                        vsc_count += 1
                    elif any("4" in p for p in parts):
                        sc_count += 1
            total = vsc_count + sc_count
            vsc_ratio[str(cid)] = float(vsc_count / max(total, 1)) if total else 0.35
    for cid in df["circuit_id"].dropna().unique():
        if str(cid) not in vsc_ratio:
            vsc_ratio[str(cid)] = 0.35
    with open(os.path.join(_models_dir, "circuit_vsc_ratio.json"), "w") as f:
        json.dump(vsc_ratio, f, indent=2)

    # Step 15 — Sort and save
    df = df.sort_values(["year", "round", "lap_number"]).reset_index(drop=True)
    df = df.drop(columns=["tyre_hardness"], errors="ignore")

    df.to_parquet(OUTPUT_PARQUET, index=False)

    # Summary
    pct_exclude = 100.0 * df["exclude_from_lstm_training"].mean() if len(df) else 0
    summary = {
        "total_rows": int(len(df)),
        "rows_per_year": df.groupby("year").size().to_dict(),
        "rows_per_compound": df.groupby("compound").size().to_dict() if "compound" in df.columns else {},
        "pct_excluded_lstm": round(float(pct_exclude), 2),
        "last_update": datetime.utcnow().isoformat() + "Z",
    }
    for k, v in summary.items():
        if isinstance(v, dict):
            summary[k] = {str(kk): int(vv) for kk, vv in v.items()}
    with open(SUMMARY_JSON, "w") as f:
        json.dump(summary, f, indent=2)

    print("Final row count:", len(df))
    print("By year:", summary.get("rows_per_year", {}))


if __name__ == "__main__":
    main()
