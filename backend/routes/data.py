"""Read-only data endpoints: health, race index, track maps, lap telemetry."""

from fastapi import APIRouter, HTTPException, Request
import pandas as pd

from backend.circuits import CIRCUIT_ID_MAP, CIRCUIT_NAMES
from backend.schemas import LapItem

router = APIRouter(tags=["data"])


def build_races_index(df: pd.DataFrame) -> list[dict]:
    if df is None or df.empty:
        return []
    races = (
        df.groupby(["year", "round", "circuit_id"])
        .agg(
            finishing_position=("position", "last"),
            total_laps=("lap_number", "max"),
        )
        .reset_index()
        .sort_values(["year", "round"])
    )
    result = []
    for _, row in races.iterrows():
        cid = str(row["circuit_id"]).lower()
        name = CIRCUIT_NAMES.get(cid, cid.replace("_", " ").title())
        result.append(
            {
                "year": int(row["year"]),
                "round": int(row["round"]),
                "circuit_id": cid,
                "circuit_name": name,
                "circuit": name,
                "finishing_position": int(row["finishing_position"])
                if pd.notna(row["finishing_position"])
                else None,
                "total_laps": int(row["total_laps"]),
            }
        )
    return result


@router.get("/health")
async def health(request: Request):
    models = request.app.state.models
    df = getattr(request.app.state, "df", None)
    return {
        "status": "ok",
        "models_loaded": models.ready if models else False,
        "lstm_loaded": models.lstm.loaded if models and models.lstm else False,
        "xgb_loaded": models.xgb.loaded if models and models.xgb else False,
        "ppo_loaded": models.ppo.loaded if models and models.ppo else False,
        "data_rows": len(df) if df is not None else 0,
    }


@router.get("/races")
async def get_races(request: Request):
    return getattr(request.app.state, "races_index", [])


@router.get("/circuit/track_map/{circuit_id:path}")
async def get_track_map(circuit_id: str, request: Request) -> dict:
    """Return track map coordinates for a circuit. circuit_id matches parquet (e.g. sakhir, yas_island)."""
    models = request.app.state.models
    maps = getattr(models, "circuit_track_maps", {})
    cid = str(circuit_id or "").lower().strip().replace("-", "_")
    map_key = CIRCUIT_ID_MAP.get(cid, cid)
    data = maps.get(map_key)
    if not data:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No map for '{cid}' (resolved to '{map_key}'). "
                f"Available keys: {sorted(maps.keys())}"
            ),
        )
    return {**data, "circuit_id": map_key}


@router.get("/race/{year:int}/{round:int}/laps", response_model=list[LapItem])
def get_race_laps(year: int, round: int, request: Request) -> list[LapItem]:
    df = getattr(request.app.state, "df", None)
    if df is None or df.empty:
        return []
    sub = df[(df["year"] == year) & (df["round"] == round)]
    if sub.empty:
        return []
    out = []
    cid = str(sub.iloc[0]["circuit_id"]).lower() if not sub.empty else ""
    for _, row in sub.iterrows():
        out.append(
            LapItem(
                lap_number=int(row["lap_number"]),
                lap_time_seconds=float(row.get("lap_time_seconds", 0)),
                compound=int(row.get("compound", 1)),
                compound_str=str(row.get("compound_str", "MEDIUM")),
                tyre_age=int(row.get("tyre_age", 0)),
                position=int(row.get("position", 10)),
                gap_ahead_seconds=float(row.get("gap_ahead_seconds", 0)),
                gap_behind_seconds=float(row.get("gap_behind_seconds", 0)),
                safety_car_active=int(row.get("safety_car_active", 0)),
                pitted_this_lap=int(row.get("pitted_this_lap", row.get("is_inlap", 0))),
                is_inlap=int(row.get("is_inlap", 0)),
                is_outlap=int(row.get("is_outlap", 0)),
                circuit_id=cid,
                fuel_load_kg=float(row["fuel_load_kg"])
                if "fuel_load_kg" in row and pd.notna(row.get("fuel_load_kg"))
                else None,
                rainfall=int(row.get("rainfall", 0)) if pd.notna(row.get("rainfall")) else 0,
                track_temp_celsius=float(row["track_temp_celsius"])
                if "track_temp_celsius" in row and pd.notna(row.get("track_temp_celsius"))
                else None,
                wind_speed=float(row["wind_speed"])
                if "wind_speed" in row and pd.notna(row.get("wind_speed"))
                else None,
                track_temp_delta=float(row["track_temp_delta"])
                if "track_temp_delta" in row and pd.notna(row.get("track_temp_delta"))
                else None,
                fresh_tyre=int(row["fresh_tyre"])
                if "fresh_tyre" in row and pd.notna(row.get("fresh_tyre"))
                else None,
                stint_number=int(row["stint_number"])
                if "stint_number" in row and pd.notna(row.get("stint_number"))
                else None,
            )
        )
    return out
