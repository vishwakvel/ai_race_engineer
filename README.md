<div align="center">

# LeclercAI

**The AI race engineer Charles deserves**

</div>

---

Are you a fellow **Charles Leclerc** fan who’s watched yet another race where the radio sounds like a group project gone wrong—vague deltas, strategy that arrives three laps late, and that special feeling when *“we are checking”* is the whole briefing? Do you quietly wish someone would just **tell him the gaps, the deg, and when to box** like they mean it?

**Feel sad no more.** Here is **LeclercAI** (*ai_race_engineer*): a full-stack playground that ingests **real Charles Leclerc race laps** (FastF1, 2018–2024), trains **LSTM + XGBoost + PPO + weather models**, runs **Monte Carlo race simulation**, and pipes the numbers into an **LLM “race engineer”** that speaks in warm, stacked team-radio style—**without inventing strategy** (the models decide; Claude just narrates).

It’s part data science project, part coping mechanism, part “what if Xavier had unlimited bandwidth and zero politics.” **Forza.**

<p align="center">
  <svg width="100%" height="4" viewBox="0 0 800 4" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><defs><linearGradient id="leclercGrad1" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:#E10600"/><stop offset="50%" style="stop-color:#DC0000"/><stop offset="100%" style="stop-color:#15151E"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#leclercGrad1)"/></svg>
</p>

## Table of contents

1. [What this project does](#what-this-project-does)
2. [High-level architecture](#high-level-architecture)
3. [Machine learning stack](#machine-learning-stack)
4. [Data pipeline](#data-pipeline)
5. [Backend (FastAPI)](#backend-fastapi)
6. [Frontend (React + Vite)](#frontend-react--vite)
7. [Repository file structure](#repository-file-structure)
8. [Setup & run](#setup--run)
9. [Training order & artifacts](#training-order--artifacts)
10. [Environment variables](#environment-variables)
11. [Docker](#docker)
12. [Disclaimer](#disclaimer)

<p align="center">
  <svg width="100%" height="3" viewBox="0 0 800 3" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><rect width="100%" height="100%" fill="#E10600" opacity="0.85"/></svg>
</p>

## What this project does

| Area | What you get |
|------|----------------|
| **Telemetry & history** | Browse **every race** in the dataset by year/round/circuit; replay **lap times**, **tyre stints**, **gaps**, **SC flags**, weather fields, fuel/stint metadata where available. |
| **Next-lap prediction** | **LSTM** on stint sequence → predicted lap time, degradation signal, tyre “cliff” risk; **weather model** nudges lap delta and advisories. |
| **Safety car intelligence** | **XGBoost** estimates SC probability with **SHAP**-style factor highlights; weather can **scale** SC risk; circuit **VSC ratio** from historical JSON. |
| **Strategy** | **PPO** policy recommends **STAY_OUT** vs **PIT_SOFT / PIT_MEDIUM / PIT_HARD**; optional **Monte Carlo** finishing distribution (P10/median/P90). |
| **Voice of the engineer** | **Anthropic Claude** generates **team radio–style messages** from *your* ML outputs only—typed (pace note, tyre advisory, box call, rain, SC, etc.). |
| **Track maps** | Per-circuit **2D track outline** for visual context (from processed GeoJSON / track map pipeline). |
| **Pre-race** | LLM **pre-race brief** with recommended vs alternative strategies (context from Monte Carlo when data is loaded). |

<p align="center">
  <svg width="100%" height="3" viewBox="0 0 800 3" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><rect width="100%" height="100%" fill="#15151E"/><rect width="35%" height="100%" fill="#E10600"/></svg>
</p>

## High-level architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Vite + React + TS)                     │
│  Landing (Hero, stats, features) → Race dashboard: replay, charts,      │
│  track map, strategy timeline, SC gauge, engineer panel, pre-race modal │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ REST (axios)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      BACKEND (FastAPI, Python 3.11+)                     │
│  ModelRegistry: LSTM | XGB | PPO | Weather | FeatureBuilder | RaceSim     │
│            MonteCarlo | RadioGenerator (Claude)                          │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
   leclerc_career_laps.parquet   data/models/*.pt,*.pkl,*.zip   ANTHROPIC_API_KEY
   circuit_track_maps.json       circuit_lap_stats.json, etc.
```

At startup, `ModelRegistry.load_all()` wires **every** inference path: models on disk, **FeatureBuilder** (needs `lstm_norm_stats.json`), **RaceSimulator** + **MonteCarloEngine**, **RadioGenerator**, circuit lap stats, and track maps.

<p align="center">
  <svg width="100%" height="4" viewBox="0 0 800 4" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><defs><linearGradient id="leclercGrad2" x1="0%" x2="100%"><stop offset="0%" stop-color="#E10600"/><stop offset="100%" stop-color="#15151E"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#leclercGrad2)"/></svg>
</p>

## Machine learning stack

### 1. LSTM — tyre / next lap (`backend/models/lstm_model.py`, `training/train_lstm.py`)

- Consumes **recent stint laps** + **current state** (circuit-normalized lap time stats, lap number, compound, tyre age, gaps, etc.).
- Outputs **predicted next lap time**, **deg rate**, **cliff probability**.
- Weights: `lstm_weights*.pt`; config: `lstm_config.json`; normalization: `lstm_norm_stats.json`.
- Training metrics (example from versioning): RMSE on lap prediction, AUC on cliff classification—the exact numbers evolve per training run (`model_versions.json`).

### 2. XGBoost — safety car probability (`backend/models/xgb_model.py`, `training/train_xgb.py`)

- Features: lap progress, **circuit**, temps, **rain**, incidents, pack proximity, field tyre age, year, wind, tyre state, etc.
- Outputs **SC probability** + **top SHAP factors** for explainability + **VSC vs full SC** ratio per circuit (`circuit_vsc_ratio.json`).
- Artifacts: `xgb_sc_model*.pkl`, `xgb_feature_names.json`, `xgb_circuit_encoding.json`.

### 3. PPO — pit strategy (`backend/models/rl_policy.py`, `training/train_rl.py`, `leclerc_race_env.py`)

- **Gymnasium** env `LeclercRaceEnv`: samples real **session** trajectories from parquet, steps with LSTM/XGB-informed dynamics.
- **Action space (4):** `STAY_OUT`, `PIT_SOFT`, `PIT_MEDIUM`, `PIT_HARD` (respects tyre allocation flags).
- Observation: normalized vector from **FeatureBuilder** (13-dim in env; API observation aligned with policy input).
- Artifact: `ppo_strategy_policy.zip` (or `_best`).

### 4. Weather models (`backend/models/weather_model.py`, `training/train_weather_model.py`)

- **`weather_lap_model.pkl`**: lap-time delta / condition signal from track temp, rain, wind, delta vs air, circuit encoding, lap fraction.
- **`weather_sc_model.pkl`**: multiplies / adjusts **SC probability** when integrated in `/predict/safety_car`.
- Exposes **weather_condition**, **weather_advisory**, **rain_risk_trend** to the UI and engineer.

### 5. Monte Carlo (`backend/simulation/monte_carlo.py`, `race_sim.py`)

- Rolls many futures from a **state** using simulator + policy; **finishing position distribution**, median, P10, P90.
- **Strategy comparison** for pre-race: evaluates candidate pit sequences + compounds.

### 6. Radio / engineer LLM (`backend/engineer/radio_generator.py`)

- **Anthropic Claude** with a fixed **system prompt**: voice inspired by **Charles’s engineer**—human, direct, 2–3 sentences, real numbers only, **box** not pit, **deg** not vague wear.
- **Message types** include: `RACE_START_SUMMARY`, `ROUTINE_PACE_NOTE`, `TYRE_ADVISORY`, `CLIFF_WARNING`, `PIT_WINDOW_OPEN`, `BOX_CALL`, `SC_ALERT`, `RAIN_STARTING`, `UNDERCUT_THREAT`, `RACE_END`, `PRERACE_BRIEF`, and more.
- **Critical rule:** LLM does **not** choose strategy—it **narrates** structured context from your pipeline.

<p align="center">
  <svg width="100%" height="3" viewBox="0 0 800 3" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><rect width="100%" height="100%" fill="#E10600" opacity="0.75"/></svg>
</p>

## Data pipeline

| Step | Script | Output |
|------|--------|--------|
| Collect | `backend/training/collect_data.py` | Per-race CSV under `backend/data/raw/` (FastF1 + lap gaps + weather) |
| Clean / feature table | `backend/training/clean_data.py` | **`backend/data/processed/leclerc_career_laps.parquet`** (~7.7k+ laps, 2018–2024) |
| Track maps | `backend/training/generate_track_maps.py` | **`backend/data/processed/circuit_track_maps.json`** |
| Summary | (written during clean) | `dataset_summary.json` (row counts, compound mix, etc.) |

**Parquet columns** (non-exhaustive): `year`, `round`, `circuit_id`, `session_id`, `lap_number`, `lap_time_seconds`, `compound` / `compound_str`, `tyre_age`, `position`, `gap_ahead_seconds`, `gap_behind_seconds`, `safety_car_active`, pit flags, `fuel_load_kg`, `rainfall`, `track_temp_celsius`, `wind_speed`, `track_temp_delta`, `stint_number`, etc.

**Supporting JSON in `backend/data/models/`:** `circuit_lap_stats.json`, `circuit_pit_loss.json`, `circuit_battle_intensity.json`, `mean_tyre_age_by_lap.json`, `model_versions.json`, etc.

<p align="center">
  <svg width="100%" height="3" viewBox="0 0 800 3" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><rect width="100%" height="100%" fill="#15151E"/></svg>
</p>

## Backend (FastAPI)

**Entry:** `backend/main.py` (loads `backend/.env`).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | API + which models loaded + parquet row count |
| GET | `/races` | List races (year, round, circuit, finish position, total laps) |
| GET | `/race/{year}/{round}/laps` | Full lap list for replay |
| GET | `/circuit/track_map/{circuit_id}` | Track polyline / metadata for map |
| POST | `/predict/next_lap` | LSTM + weather-adjusted next lap |
| POST | `/predict/safety_car` | XGB SC probability + SHAP + weather multiplier |
| GET | `/predict/weather/{circuit_id}` | Standalone weather advisory |
| POST | `/strategy/recommend` | PPO action + optional Monte Carlo distribution |
| POST | `/engineer/message` | Claude radio line from context |
| GET | `/engineer/prerace_strategy` | Pre-race brief + strategy options |
| GET | `/debug/model_versions` | Active + history of trained artifacts |

**Imports:** Run as package from repo root so `backend.*` resolves (see run commands below).

<p align="center">
  <svg width="100%" height="4" viewBox="0 0 800 4" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><defs><linearGradient id="leclercGrad3" x1="0%" x2="100%"><stop offset="0%" stop-color="#15151E"/><stop offset="100%" stop-color="#E10600"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#leclercGrad3)"/></svg>
</p>

## Frontend (React + Vite)

**Stack:** React 18, TypeScript, Vite, Tailwind, **Zustand** (`raceStore`), **TanStack Query** (where used), **Recharts**, **Framer Motion**, **Axios**.

| Path | Role |
|------|------|
| `src/App.tsx` | Landing sections + scroll into **dashboard** |
| `src/pages/RaceDashboard.tsx` | Main grid: race picker, replay controls, charts, map, engineer |
| `src/hooks/useRaceReplay.ts` | Lap stepping + API calls (predict, strategy, engineer, SC) |
| `src/store/raceStore.ts` | Selected race, laps, live ML state |
| `src/api/client.ts` | Base URL from `VITE_API_BASE_URL`, lap mapping, API helpers |
| `src/types/index.ts` | Shared TS types |
| **Homepage** | `Hero`, `StatsStrip`, `FeatureSection`, `EnterDashboard` |
| **Telemetry** | `LapTimeChart`, `TyreDegradationCard`, `PositionTracker` |
| **Strategy** | `StrategyTimeline`, `PitWindowCard`, `PositionDistribution` |
| **Safety** | `SafetyCarGauge` |
| **Track** | `TrackMap` (circuit outline + position) |
| **Engineer** | `EngineerPanel`, `RadioMessage`, `BoxBoxBanner`, `PreRaceModal` |
| `src/components/layout/Header.tsx` | Dashboard header |

**UX theme:** Dashboard uses CSS variables (`--dash-bg`, `--dash-surface`, `--dash-border`, etc.) for a **clean, light, data-dense** look—Ferrari **#E10600** accents show up in UI elements where the app highlights calls to action (e.g. box box energy), keeping the page mostly **white / off-white**.

<p align="center">
  <svg width="100%" height="3" viewBox="0 0 800 3" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><rect width="100%" height="100%" fill="#E10600"/></svg>
</p>

## Repository file structure

```
ai_race_engineer/
├── README.md
├── docker-compose.yml
├── test_api.py                          # Quick API smoke tests (if present)
│
├── backend/
│   ├── main.py                          # FastAPI app, routes, lifespan
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env                             # ANTHROPIC_API_KEY, optional paths
│   ├── utils.py
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── model_registry.py            # Loads all models + sim + radio + maps
│   │   ├── lstm_model.py
│   │   ├── xgb_model.py
│   │   ├── rl_policy.py
│   │   └── weather_model.py
│   │
│   ├── features/
│   │   ├── feature_builder.py           # LSTM sequences + RL observation vector
│   │   └── validate_features.py
│   │
│   ├── simulation/
│   │   ├── race_sim.py                  # Roll laps with loaded nets
│   │   └── monte_carlo.py               # Distributions + strategy compare
│   │
│   ├── engineer/
│   │   └── radio_generator.py           # Claude prompts + message typing
│   │
│   ├── training/
│   │   ├── collect_data.py              # FastF1 → raw CSV
│   │   ├── clean_data.py                # → parquet
│   │   ├── generate_track_maps.py
│   │   ├── train_lstm.py
│   │   ├── train_xgb.py
│   │   ├── train_weather_model.py
│   │   ├── train_rl.py                  # PPO (SB3)
│   │   ├── leclerc_race_env.py
│   │   └── model_versioning.py
│   │
│   ├── data/
│   │   ├── raw/                         # CSVs, f1_cache, geojson
│   │   ├── processed/                   # leclerc_career_laps.parquet, track maps, summaries
│   │   └── models/                      # .pt, .pkl, .zip, JSON sidecars
│   │
│   └── notebooks/
│       └── 01_exploration.ipynb
│
└── frontend/
    ├── Dockerfile
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.ts
    ├── tsconfig.json
    ├── .env                             # VITE_API_BASE_URL=http://localhost:8000
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css
        ├── vite-env.d.ts
        ├── api/client.ts
        ├── store/raceStore.ts
        ├── hooks/useRaceReplay.ts, useScrollReveal.ts
        ├── types/index.ts
        ├── pages/RaceDashboard.tsx
        └── components/
            ├── homepage/, layout/, common/
            ├── dashboard/, telemetry/, strategy/, safety/
            ├── track/, engineer/
            └── ...
```

<p align="center">
  <svg width="100%" height="3" viewBox="0 0 800 3" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><rect width="100%" height="100%" fill="#15151E"/><rect x="0" width="12%" height="100%" fill="#E10600"/></svg>
</p>

## Setup & run

### Backend

```bash
cd ai_race_engineer
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
```

Copy `backend/.env` and set **`ANTHROPIC_API_KEY`** for engineer radio. Ensure **`backend/data/processed/leclerc_career_laps.parquet`** and **`backend/data/models/`** artifacts exist (or run the training pipeline below).

From **repository root**:

```bash
uvicorn backend.main:app --reload
```

- API: **http://localhost:8000**  
- OpenAPI docs: **http://localhost:8000/docs**

Optional env:

- **`DATA_DIR`** — folder containing `leclerc_career_laps.parquet` (default: `backend/data/processed/`).
- **`MODEL_DIR`** — override for `backend/data/models`.

### Frontend

```bash
cd frontend && npm install
npm run dev
```

- App: **http://localhost:5173**  
- Set `VITE_API_BASE_URL` in `frontend/.env` if the API is not on `http://localhost:8000`.

<p align="center">
  <svg width="100%" height="4" viewBox="0 0 800 4" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><rect width="100%" height="100%" fill="#E10600" opacity="0.9"/></svg>
</p>

## Training order & artifacts

1. **`python -m backend.training.collect_data`** — downloads/saves raw laps (FastF1 cache under `data/raw/f1_cache` by default).
2. **`python -m backend.training.clean_data`** — builds **`leclerc_career_laps.parquet`**.
3. **`python -m backend.training.train_lstm`** → `lstm_weights*.pt`, `lstm_config.json`, `lstm_norm_stats.json`.
4. **`python -m backend.training.train_xgb`** → `xgb_sc_model*.pkl` + feature JSON.
5. **`python -m backend.training.train_weather_model`** → `weather_lap_model.pkl`, `weather_sc_model.pkl`.
6. **`python -m backend.training.train_rl`** → `ppo_strategy_policy.zip`.

**Versioning:** `model_versions.json` tracks **active** weights and **history** (timestamps, RMSE, AUC, Brier, etc.). Symlink or copy active files to names the registry expects (`ppo_strategy_policy.zip`, `lstm_weights.pt`, `xgb_sc_model.pkl`) or adjust loading paths in code.

Track maps: **`python -m backend.training.generate_track_maps`** (as documented in that module).

<p align="center">
  <svg width="100%" height="3" viewBox="0 0 800 3" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><rect width="100%" height="100%" fill="#15151E"/></svg>
</p>

## Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `ANTHROPIC_API_KEY` | `backend/.env` | Claude for `/engineer/message` and pre-race brief |
| `VITE_API_BASE_URL` | `frontend/.env` | Backend origin for axios |
| `DATA_DIR` | backend | Parquet location |
| `MODEL_DIR` | backend | Models + JSON sidecars |
| `F1_CACHE_DIR` | optional | FastF1 cache path |

<p align="center">
  <svg width="100%" height="3" viewBox="0 0 800 3" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><rect width="100%" height="100%" fill="#E10600"/></svg>
</p>

## Docker

```bash
docker compose up --build
```

- **Backend:** port **8000**, mounts `./backend/data` → `/app/data`.
- **Frontend:** port **5173**, depends on backend.

Dockerfiles live at **`backend/Dockerfile`** and **`frontend/Dockerfile`**.

<p align="center">
  <svg width="100%" height="4" viewBox="0 0 800 4" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><defs><linearGradient id="leclercGrad4" x1="0%" x2="100%"><stop offset="0%" stop-color="#E10600"/><stop offset="100%" stop-color="#15151E"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#leclercGrad4)"/></svg>
</p>