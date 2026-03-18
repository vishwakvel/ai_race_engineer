"""
Collect Charles Leclerc race laps from FastF1 (2018–2024).
Produces raw CSV files per race in backend/data/raw/.
Run: python -m backend.training.collect_data
"""

import os
import sys
import pandas as pd
import numpy as np

# FastF1 cache must be set before importing fastf1
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DATA_RAW = os.path.join(_BACKEND_DIR, "data", "raw")
CACHE_DIR = os.environ.get("F1_CACHE_DIR", os.path.join(_DATA_RAW, "f1_cache"))
os.makedirs(CACHE_DIR, exist_ok=True)

import fastf1

fastf1.Cache.enable_cache(CACHE_DIR)

YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024]
DRIVER = "LEC"
OUTPUT_DIR = _DATA_RAW


def _lap_time_to_seconds(lt) -> float:
    """Convert LapTime (Timedelta or NaT) to seconds."""
    if pd.isna(lt):
        return np.nan
    if hasattr(lt, "total_seconds"):
        return lt.total_seconds()
    return float(lt)


def _get_weather_at_lap(weather_df: pd.DataFrame, lap_time) -> dict:
    """Get weather row closest to lap time. Returns dict with AirTemp, TrackTemp, Rainfall, WindSpeed."""
    if weather_df is None or weather_df.empty or pd.isna(lap_time):
        return {"air_temp": np.nan, "track_temp": np.nan, "rainfall": 0, "wind_speed": np.nan}
    try:
        if hasattr(lap_time, "to_pydatetime"):
            t = lap_time.to_pydatetime()
        else:
            t = lap_time
        if weather_df.index.tz is not None and getattr(t, "tzinfo", None) is None:
            try:
                import datetime
                t = t.replace(tzinfo=weather_df.index.tz)
            except Exception:
                pass
        idx = weather_df.index.get_indexer([t], method="nearest")[0]
        row = weather_df.iloc[idx]
        rainfall = 1 if getattr(row, "Rainfall", 0) or getattr(row, "rainfall", 0) else 0
        return {
            "air_temp": getattr(row, "AirTemp", getattr(row, "air_temp", np.nan)),
            "track_temp": getattr(row, "TrackTemp", getattr(row, "track_temp", np.nan)),
            "rainfall": rainfall,
            "wind_speed": getattr(row, "WindSpeed", getattr(row, "wind_speed", np.nan)),
        }
    except Exception:
        return {"air_temp": np.nan, "track_temp": np.nan, "rainfall": 0, "wind_speed": np.nan}


def _compute_gaps(session, lec_laps: pd.DataFrame) -> tuple[list[float], list[float]]:
    """
    Compute gap_ahead and gap_behind per lap for Leclerc.
    Returns (gap_ahead_seconds list, gap_behind_seconds list) aligned to lec_laps.
    """
    all_laps = session.laps
    if all_laps is None or all_laps.empty:
        return [0.0] * len(lec_laps), [0.0] * len(lec_laps)

    # Cumulative time per driver per lap number (race time at end of lap N)
    drivers = all_laps["Driver"].dropna().unique()
    lap_numbers = sorted(lec_laps["LapNumber"].dropna().unique().astype(int))

    cumtime = {}  # (driver, lap_number) -> cumulative seconds
    for drv in drivers:
        drv_laps = all_laps[all_laps["Driver"] == drv].sort_values("LapNumber")
        cum = 0.0
        for _, row in drv_laps.iterrows():
            ln = int(row["LapNumber"]) if pd.notna(row["LapNumber"]) else None
            if ln is None:
                continue
            lt = _lap_time_to_seconds(row.get("LapTime"))
            if np.isnan(lt):
                continue
            cum += lt
            cumtime[(drv, ln)] = cum

    gap_ahead_list = []
    gap_behind_list = []
    for _, lap_row in lec_laps.iterrows():
        lap_num = int(lap_row["LapNumber"]) if pd.notna(lap_row["LapNumber"]) else None
        pos = lap_row.get("Position")
        if pd.isna(pos):
            pos = None
        else:
            try:
                pos = int(pos)
            except (ValueError, TypeError):
                pos = None

        if lap_num is None or pos is None:
            gap_ahead_list.append(0.0)
            gap_behind_list.append(0.0)
            continue

        lec_cum = cumtime.get((DRIVER, lap_num), np.nan)
        if np.isnan(lec_cum):
            gap_ahead_list.append(0.0)
            gap_behind_list.append(0.0)
            continue

        # Find cumulative times for driver in P-1 and P+1 at this lap
        times_at_lap = []
        for d in drivers:
            t = cumtime.get((d, lap_num))
            if t is not None and not np.isnan(t):
                times_at_lap.append((d, t))
        times_at_lap.sort(key=lambda x: x[1])

        positions = {d: i + 1 for i, (d, _) in enumerate(times_at_lap)}
        lec_pos_in_sorted = positions.get(DRIVER)
        if lec_pos_in_sorted is None:
            gap_ahead_list.append(0.0)
            gap_behind_list.append(0.0)
            continue

        gap_ahead = 0.0
        gap_behind = 0.0
        for i, (d, t) in enumerate(times_at_lap):
            if d == DRIVER:
                if i > 0:
                    gap_ahead = t - times_at_lap[i - 1][1]
                if i < len(times_at_lap) - 1:
                    gap_behind = times_at_lap[i + 1][1] - t
                break
        gap_ahead_list.append(float(min(120.0, max(0.0, gap_ahead))))
        gap_behind_list.append(float(min(120.0, max(0.0, gap_behind))))

    return gap_ahead_list, gap_behind_list


def collect_race(year: int, round_num: int, circuit_id: str) -> None:
    """Load one race session, extract Leclerc laps, save CSV."""
    output_path = os.path.join(OUTPUT_DIR, f"lec_{year}_{round_num:02d}.csv")
    if os.path.exists(output_path):
        print(f"[{year}][R{round_num:02d}] Already exists, skipping")
        return
    try:
        session = fastf1.get_session(year, round_num, "R")
        session.load(
            telemetry=False,
            weather=True,
            messages=False,
            laps=True,
        )
    except Exception as e:
        print(f"[{year}][R{round_num:02d}] Failed to load: {e}", file=sys.stderr)
        return

    laps = session.laps
    if laps is None or laps.empty:
        print(f"[{year}][R{round_num:02d}] No laps data", file=sys.stderr)
        return

    try:
        lec = laps.pick_driver(DRIVER)
    except Exception:
        lec = laps[laps["Driver"] == DRIVER] if "Driver" in laps.columns else pd.DataFrame()

    if lec is None or lec.empty:
        print(f"[{year}][R{round_num:02d}] No LEC laps", file=sys.stderr)
        return

    lec = lec.sort_values("LapNumber").reset_index(drop=True)
    weather_df = getattr(session, "weather_data", None)
    if weather_df is not None and not isinstance(weather_df, pd.DataFrame):
        weather_df = None

    # Position: fill forward NaN
    if "Position" in lec.columns:
        lec["Position"] = lec["Position"].ffill().bfill()
    else:
        lec["Position"] = np.nan

    # Consecutive NaN position check
    pos_na = lec["Position"].isna()
    if pos_na.any():
        runs = pos_na.astype(int).diff().fillna(0).abs().cumsum()
        for _, g in lec.groupby(runs):
            if g["Position"].isna().all() and len(g) > 5:
                print(f"[{year}][R{round_num:02d}] WARNING: >5 consecutive NaN positions", file=sys.stderr)

    gap_ahead_list, gap_behind_list = _compute_gaps(session, lec)

    rows = []
    compounds_used = set()
    for i in range(len(lec)):
        row = lec.iloc[i]
        lap_num = int(row["LapNumber"]) if pd.notna(row["LapNumber"]) else i + 1
        lap_time = row.get("LapTime")
        lap_time_sec = _lap_time_to_seconds(lap_time)
        compound = row.get("Compound")
        if pd.isna(compound) or compound is None or str(compound).strip() == "":
            compound = "UNKNOWN"
        if compound and str(compound).strip().upper() != "UNKNOWN":
            compounds_used.add(str(compound).strip().upper())
        tyre_life = row.get("TyreLife")
        if pd.isna(tyre_life):
            tyre_life = 0
        try:
            tyre_life = int(tyre_life)
        except (ValueError, TypeError):
            tyre_life = 0
        position = row.get("Position")
        if pd.isna(position):
            position = 0
        try:
            position = int(position)
        except (ValueError, TypeError):
            position = 0
        track_status = str(row.get("TrackStatus", "")) if pd.notna(row.get("TrackStatus")) else ""
        pit_in = pd.notna(row.get("PitInTime"))
        pit_out = pd.notna(row.get("PitOutTime"))
        ft = row.get("FreshTyre", True)
        if pd.isna(ft):
            ft = True
        fresh_tyre = 1 if ft is True or ft == 1 or str(ft).lower() in ("true", "1") else 0

        time_val = row.get("Time") if "Time" in row.index else None
        weather = _get_weather_at_lap(weather_df, time_val)

        gap_ahead = gap_ahead_list[i] if i < len(gap_ahead_list) else 0.0
        gap_behind = gap_behind_list[i] if i < len(gap_behind_list) else 0.0

        rows.append({
            "year": year,
            "round": round_num,
            "circuit_id": circuit_id,
            "lap_number": lap_num,
            "lap_time_seconds": lap_time_sec,
            "compound": str(compound).strip() if compound else "UNKNOWN",
            "tyre_life": tyre_life,
            "position": position,
            "gap_ahead_seconds": gap_ahead,
            "gap_behind_seconds": gap_behind,
            "air_temp": weather["air_temp"],
            "track_temp": weather["track_temp"],
            "rainfall": 1 if weather["rainfall"] else 0,
            "wind_speed": weather["wind_speed"],
            "pit_in": pit_in,
            "pit_out": pit_out,
            "track_status": track_status,
            "fresh_tyre": fresh_tyre,
        })

    df = pd.DataFrame(rows)
    out_path = os.path.join(OUTPUT_DIR, f"lec_{year}_{round_num:02d}.csv")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    df.to_csv(out_path, index=False)
    print(f"[{year}][R{round_num:02d} {circuit_id}] Loaded {len(rows)} laps")


def main() -> None:
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    for year in YEARS:
        try:
            schedule = fastf1.get_event_schedule(year, include_testing=False)
            schedule = schedule[schedule["RoundNumber"] > 0]
        except Exception as e:
            print(f"[{year}] Schedule fetch error: {e}", file=sys.stderr)
            continue

        for _, event in schedule.iterrows():
            round_num = int(event["RoundNumber"])
            circuit_id = str(event["Location"]).lower().replace(" ", "_")
            try:
                collect_race(year, round_num, circuit_id)
            except Exception as e:
                print(f"[{year}][R{round_num:02d}] Error: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
