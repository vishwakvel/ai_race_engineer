```
              ██╗     ███████╗ ██████╗██╗     ███████╗██████╗  ██████╗    █████╗ ██╗
              ██║     ██╔════╝██╔════╝██║     ██╔════╝██╔══██╗██╔════╝   ██╔══██╗██║
              ██║     █████╗  ██║     ██║     █████╗  ██████╔╝██║        ███████║██║
              ██║     ██╔══╝  ██║     ██║     ██╔══╝  ██╔══██╗██║        ██╔══██║██║
              ███████╗███████╗╚██████╗███████╗███████╗██║  ██║╚██████╗   ██║  ██║██║
              ╚══════╝╚══════╝ ╚═════╝╚══════╝╚══════╝╚═╝  ╚═╝ ╚═════╝   ╚═╝  ╚═╝╚═╝
```

*Imagine watching Charles Leclerc lose a race because of poor communication and strategy from the pit wall. LeclercAI is an AI race engineer trained on 7 years of his real race data — the race engineer Charles Leclerc truly deserves.*

**Live stack:** [Vercel](https://vercel.com) (frontend) + [Render](https://render.com) (backend API). No database — lap telemetry and ML models ship inside the backend container.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Production Deployment](#production-deployment)
3. [Machine Learning Stack](#machine-learning-stack)
4. [How It All Connects](#how-it-all-connects)
5. [Data Pipeline](#data-pipeline)
6. [Backend API](#backend-api)
7. [Frontend](#frontend)
8. [File Structure](#file-structure)
9. [Setup & Run (Local)](#setup--run-local)
10. [Training Pipeline](#training-pipeline)
11. [Environment Variables](#environment-variables)
12. [Docker (Local)](#docker-local)
13. [CI](#ci)
14. [Message Types Reference](#message-types-reference)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                        BROWSER — React + TypeScript                         │
│                                                                             │
│   ┌─────────────────────┐  ┌─────────────────────────────────────────┐      │
│   │  Cinematic Landing  │  │            Pit Wall Dashboard           │      │
│   │                     │  │                                         │      │
│   │  · Intro splash     │  │  ┌──────────┐ ┌──────────┐ ┌─────────┐  │      │
│   │  · Hero + About     │  │  │ Race     │ │ Circuit  │ │ Engineer│  │      │
│   │  · How It Works     │  │  │ Selector │ │   Map    │ │  Panel  │  │      │
│   │  · OPEN PIT WALL →  │  │  │          │ │          │ │         │  │      │
│   └─────────────────────┘  │  │ Lap      │ │  Car dot │ │  Radio  │  │      │
│                            │  │ Controls │ │  animates│ │  feed   │  │      │
│                            │  └──────────┘ └──────────┘ └─────────┘  │      │
│                            │   Lap Times·Tyre Deg·SC Gauge·Strategy  │      │
│                            └─────────────────────────────────────────┘      │
│                                                                             │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │  REST / axios
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                         FASTAPI — Python 3.11                               │
│                                                                             │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                        ModelRegistry                                 │  │
│   │                                                                      │  │
│   │   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────────┐  │  │
│   │   │   LSTM   │   │ XGBoost  │   │   PPO    │   │  Weather Model   │  │  │
│   │   │ (PyTorch)│   │(sklearn) │   │  (SB3)   │   │ (GradBoost×2)    │  │  │
│   │   └────┬─────┘   └────┬─────┘   └────┬─────┘   └────────┬─────────┘  │  │
│   │        │              │              │                  │            │  │
│   │        └──────────────┴──────────────┴──────────────────┘            │  │
│   │                                  │                                   │  │
│   │                     ┌────────────▼────────────┐                      │  │
│   │                     │    FeatureBuilder        │                     │  │
│   │                     │  (normalizes all inputs) │                     │  │
│   │                     └────────────┬────────────┘                      │  │
│   │                                  │                                   │  │
│   │              ┌───────────────────▼──────────────────────┐            │  │
│   │              │          RadioGenerator (Claude)         │            │  │
│   │              │   receives structured ML context only    │            │  │
│   │              │   outputs authentic team radio message   │            │  │
│   │              └──────────────────────────────────────────┘            │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
              ┌────────────────────┼──────────────────────────┐
              ▼                    ▼                           ▼
   leclerc_career_laps.parquet   *.pt / *.pkl / *.zip    ANTHROPIC_API_KEY
   circuit_track_maps.json       circuit_lap_stats.json
```

### Production topology

```
                    ┌─────────────────────────────────────┐
                    │  Browser                            │
                    └──────────────┬──────────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
   ┌──────────────────────┐              ┌──────────────────────────┐
   │  Vercel              │              │  Render                  │
   │  React SPA (static)  │   REST/axios │  FastAPI Docker service  │
   │  GSAP landing page   │─────────────►│  PyTorch + XGB + PPO     │
   │  Pit wall dashboard  │              │  parquet + models on disk│
   └──────────────────────┘              └────────────┬─────────────┘
                                                      │
                                                      ▼
                                           Anthropic Claude API
                                           (engineer radio only)
```

There is **no PostgreSQL, Redis, or background worker**. Render hosts the always-on Python process; Vercel serves the built frontend only.

---

## Production Deployment

### Render — backend API

Deploy as a **Web Service → Docker** from this repo.

| Setting | Value |
|---------|--------|
| **Root directory** | *(empty — repo root, not `backend/`)* |
| **Dockerfile path** | `backend/Dockerfile` |
| **Health check path** | `/health` |
| **Blueprint** | Optional — use root `render.yaml` |

The Dockerfile builds from the **monorepo root** (`COPY backend/ …`). Setting root directory to `backend/` will break the build.

**Environment variables (Render dashboard):**

| Variable | Required | Secret? | Notes |
|----------|----------|---------|-------|
| `ANTHROPIC_API_KEY` | ✅ Yes | ✅ Yes | Powers live team radio via Claude |
| `PORT` | Auto | — | Injected by Render — do not set manually |
| `PYTHONPATH` | No | — | Defaults to `/app` in Dockerfile |
| `DATA_DIR` | No | — | Defaults to `/app/backend/data/processed` |
| `MODEL_DIR` | No | — | Defaults to `/app/backend/data/models` |

**Secret files:** none. Models and parquet are baked into the image; the API key is a single env var.

After deploy, verify:

```bash
curl https://<your-service>.onrender.com/health
# expect: {"status":"ok","models_loaded":true,"data_rows":7775,...}
```

**Free tier note:** Render spins down idle services. The first request after sleep can take 30–60s while models load.

### Vercel — frontend

| Setting | Value |
|---------|--------|
| **Root directory** | `frontend` |
| **Build command** | `npm run build` |
| **Output directory** | `dist` |
| **Framework preset** | Vite |

**Environment variable (Vercel dashboard):**

| Variable | Value |
|----------|--------|
| `VITE_API_BASE_URL` | `https://<your-render-service>.onrender.com` |

Redeploy Vercel after changing `VITE_API_BASE_URL` — Vite bakes it in at build time.

CORS on the backend already allows `https://*.vercel.app` and the production preview URL (`backend/main.py`).

### End-to-end checklist

1. Deploy backend on Render → copy service URL.
2. Set `VITE_API_BASE_URL` on Vercel → redeploy frontend.
3. Open the Vercel URL → scroll through landing → **OPEN PIT WALL** → load a race → confirm lap replay and radio messages.

---

## Machine Learning Stack

### Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      INFERENCE FLOW (per lap)                       │
│                                                                     │
│   Lap data ──┬──► LSTM ────────────────► predicted_lap_time         │
│              │    (tyre + pace)          deg_rate_tenths/lap        │
│              │                           cliff_probability          │
│              │                                    │                 │
│              ├──► XGBoost ─────────────► sc_probability             │
│              │    (SC risk)              vsc_ratio                  │
│              │                           top_shap_factors           │
│              │                                    │                 │
│              ├──► Weather Model ────────► weather_lap_delta         │
│              │    (conditions)           sc_multiplier              │
│              │                           weather_advisory           │
│              │                                    │                 │
│              └──► PPO Policy ──────────► STAY_OUT / PIT_x           │
│                   (strategy)             pit_window_laps            │
│                                          action_confidence          │
│                                                    │                │
│                              Monte Carlo ──────────┘                │
│                              (50 simulated futures)                 │
│                                    │                                │
│                                    ▼                                │
│                         finishing_distribution                      │
│                         median_finish / P10 / P90                   │
│                                    │                                │
│                                    ▼                                │
│                        ┌─────────────────────┐                      │
│                        │   RadioGenerator     │                     │
│                        │   Claude API         │                     │
│                        │   ≤ 3 sentences      │                     │
│                        │   real numbers only  │                     │
│                        └─────────────────────┘                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Model 1 — LSTM: Tyre Degradation & Lap Time

```
INPUT (per timestep in current stint):
  ┌──────────────────────────────────────────────────────────┐
  │  lap_time_seconds (circuit z-score)                      │
  │  tyre_age                    fuel_load_kg                │
  │  track_temp_celsius          air_temp_celsius            │
  │  gap_ahead_seconds           gap_behind_seconds          │
  │  safety_car_active           wind_speed                  │
  │  fresh_tyre (0/1)                                        │
  │  + compound embedding  →  4-dim learned vector           │
  └──────────────────────────────────────────────────────────┘
                         ↓
              LSTM (128 hidden, 3 layers, dropout 0.25)
                         ↓
  ┌──────────────────────────────────────────────────────────┐
  │  OUTPUT                                                  │
  │  predicted_lap_time   (denormalized via circuit stats)   │
  │  deg_rate_tenths      (tenths per lap, -2 to +8)         │
  │  cliff_probability    (tyre performance cliff risk)      │
  └──────────────────────────────────────────────────────────┘
```

**Key design choices:**
- Circuit-normalized lap times prevent the model from learning circuit identity instead of tyre physics
- Compound embedded (not one-hot) so the model learns compound *similarity* (soft/medium more alike than soft/wet)
- `fresh_tyre` flag accounts for used qualifying sets entering the race with pre-existing wear
- Cliff probability override: if `tyre_age > threshold[compound]`, a rule-based floor ensures the model never outputs unrealistically low cliff risk on ancient tyres

**Training:** 7,775 laps, 2018–2024, filtered to clean laps (no inlaps/outlaps/SC laps). Early stopping on validation RMSE. Test RMSE: **4.17s**

---

### Model 2 — XGBoost: Safety Car Probability

```
INPUT (13 features):
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  lap_number              laps_remaining                air_temp          │
  │  circuit_encoded         track_temp                    track_temp_delta  │
  │  rainfall                wind_speed                                      │
  │  incidents_so_far        field_tyre_stress_index                         │
  │  mean_tyre_age_field     historical_sc_rate                              │
  │  lap_fraction            year                                            │
  └──────────────────────────────────────────────────────────────────────────┘
                         ↓
        Calibrated XGBoost  ×0.70  +  Logistic Regression  ×0.30
                         ↓
  ┌──────────────────────────────────────────────────────────┐
  │  OUTPUT                                                  │
  │  sc_probability           (calibrated 0–1)               │
  │  × weather_sc_multiplier  (from Weather Model)           │
  │  = adjusted_sc_probability                               │
  │                                                          │
  │  vsc_ratio   (circuit historical VSC vs full SC rate)    │
  │  top_shap_factors  (3 human-readable factors)            │
  └──────────────────────────────────────────────────────────┘
```

**Key design choices:**
- Ensemble (XGB + LR) significantly improves calibration for rare events — pure XGBoost tends to be overconfident
- `field_tyre_stress_index = tyre_age / (compound_hardness + 1)` captures field-level blowout risk, not just Leclerc's tyres
- `track_temp_delta` as a feature: dropping track temp = incoming rain = elevated SC risk (leading indicator)
- Circuit VSC ratio prevents the model from treating VSC and full SC as identical — they have different strategic implications

**Training:** AUC **0.74**, Brier score **0.04**

---

### Model 3 — PPO: Pit Strategy Policy

```
OBSERVATION (13-dim, normalized 0–1):
  ┌──────────────────────────────────────────────────────────┐
  │  lap_fraction            laps_remaining_fraction         │
  │  position / 20           compound / 4                    │
  │  tyre_age / 60           fuel_load / 110                 │
  │  gap_ahead / 30          gap_behind / 30                 │
  │  sc_probability          cliff_probability               │
  │  soft_available (0/1)    hard_available (0/1)            │
  │  stint_number / 3                                        │
  └──────────────────────────────────────────────────────────┘

ACTION SPACE (4 discrete):
  0 = STAY_OUT
  1 = PIT_SOFT
  2 = PIT_MEDIUM
  3 = PIT_HARD

REWARD STRUCTURE:
  +120/85/60/40/28/18/12/8/5/3  →  final position P1–P10
  +20   →  pitting under safety car
  +0–5  →  optimal stint length (deviation from target)
  +10   →  pitting for wet compound in rainfall
  -30   →  pitting before lap 10 or tyre_age < 12
  -15   →  tyre cliff event
  +2    →  per position gained per lap
```

**Training environment:** `LeclercRaceEnv` samples real race sessions, uses LSTM + XGBoost for dynamics. Trained with SB3 PPO for 1M steps. `ep_rew_mean` target: >35.

---

### Model 4 — Weather: Condition Impact

```
INPUT:
  track_temp, air_temp, temp_delta (track-air),
  rainfall, wind_speed, track_temp_delta,
  is_cool_track, is_hot_track,
  circuit_encoded, lap_fraction

         ↓                        ↓
  GradBoost Regressor       GradBoost Regressor
  (lap time delta)          (SC risk multiplier)

OUTPUT:
  weather_lap_delta      →  added to LSTM lap time prediction
  weather_sc_multiplier  →  multiplied onto XGBoost SC probability
  weather_condition      →  "dry" / "damp" / "wet" / "extreme"
  weather_advisory       →  plain-English alert (no Claude needed)
  rain_risk_trend        →  "stable" / "increasing" / "decreasing"
```

The weather model acts as a **correction layer** on top of the other models. A sudden track temp drop of >3°C in one lap signals incoming rain — the SC multiplier spikes before the rain even registers.

---

### Model 5 — RadioGenerator: Claude

```
┌──────────────────────────────────────────────────────────────────────┐
│                    WHAT CLAUDE RECEIVES                              │
│                                                                      │
│  message_type: BOX_CALL                                              │
│                                                                      │
│  data (filtered to only what's relevant for this type):              │
│    position: 3                                                       │
│    gap_ahead: 1.8s                                                   │
│    gap_behind: 4.2s                                                  │
│    tyre_age: 24 laps                                                 │
│    recommended_action: PIT_MEDIUM   ← from PPO                       │
│    median_finish: P2                ← from Monte Carlo               │
│    circuit_name: Bahrain                                             │
│                                                                      │
│  system_prompt: Xavier Marcos Padros persona, voice rules,           │
│                 forbidden words, length constraints (2–3 sentences)  │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                    WHAT CLAUDE OUTPUTS                               │
│                                                                      │
│  "Box this lap, box this lap. Mediums going on.                      │
│   Gap behind is 4.2 — you exit in clean air, P2 on merit."           │
└──────────────────────────────────────────────────────────────────────┘
```

**Claude does NOT decide strategy.** It receives structured data from the ML pipeline and narrates it in authentic team radio style. The system prompt enforces: real numbers only, no invented facts, max 3 sentences, F1 vocabulary ("box" not "pit", "deg" not "tyre wear").

---

## How It All Connects

This is the full per-lap inference chain during a replay:

```
lap N data arrives from parquet
         │
         ▼
┌──────────────────────────────────────────────────────────────────────┐
│  useRaceReplay.ts  (frontend state machine)                          │
│                                                                      │
│  1. Build current_state dict from lap data                           │
│     + weather fields + circuit stats + stint history                 │
└────────────────┬─────────────────────────────────────────────────────┘
                 │  parallel API calls
        ┌────────┼────────────┬────────────────────┐
        ▼        ▼            ▼                    ▼
   POST          POST         POST                GET
   /predict/     /predict/    /strategy/          /predict/
   next_lap      safety_car   recommend           weather/{id}
        │        │            │                    │
        ▼        ▼            ▼                    ▼
   LSTM +        XGBoost +    PPO +              Weather
   weather       weather      Monte Carlo        Model
   delta         multiplier   (50 sims)
        │        │            │                    │
        └────────┴────────────┴────────────────────┘
                              │
                    assemble full context
                              │
                              ▼
                    POST /engineer/message
                              │
                    RadioGenerator → Claude API
                              │
                              ▼
              "Gap behind is 3.2, stable. Deg is 0.2 tenths.
               We're in good shape — push through sector 2."
                              │
                              ▼
                    displayed in Engineer Panel
                    with urgency color coding
                    (ROUTINE / ADVISORY / URGENT)
```

---

## Data Pipeline

```
FastF1 API  ─────────────────────────────────────────────────────────►
                                                                      │
  collect_data.py                                                     │
  ───────────────                                                     │
  · Downloads race sessions 2018–2024 for Charles Leclerc             │
  · Extracts per-lap: lap time, compound, tyre age, position,         │
    gaps, fuel estimate, weather (temp, rain, wind), SC flags         │
  · Joins weather_data by timestamp (merge_asof)                      │
  · Saves to backend/data/raw/*.csv                                   │
                                                                      │
  clean_data.py                                                       │
  ─────────────                                                       │
  · Normalizes compound names (HYPERSOFT → SOFT etc.)                 │
  · Computes: fuel_load_kg, lap_time_normalized (circuit z-score)     │
  · Computes: track_temp_delta, field_tyre_stress_index               │
  · Computes: fresh_tyre, stint_number                                │
  · Saves circuit stats: circuit_lap_stats.json                       │
  · Saves circuit pit loss: circuit_pit_loss.json                     │
  · Saves battle intensity: circuit_battle_intensity.json             │
  · Saves VSC ratios: circuit_vsc_ratio.json                          │
  · Output: leclerc_career_laps.parquet                               │
                                                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│  leclerc_career_laps.parquet                                        │
│  7,775 rows · 34 circuits · 7 seasons (2018–2024)                   │
│                                                                     │
│  year  round  circuit_id  lap_number  lap_time_seconds  compound    │
│  tyre_age  position  gap_ahead  gap_behind  fuel_load_kg            │
│  rainfall  track_temp  air_temp  wind_speed  track_temp_delta       │
│  safety_car_active  pitted_this_lap  stint_number  fresh_tyre       │
│  field_tyre_stress_index  circuit_lt_mean  circuit_lt_std  ...      │
└─────────────────────────────────────────────────────────────────────┘

  generate_track_maps.py
  ──────────────────────
  · Downloads bacinger/f1-circuits GeoJSON (real GPS coordinates)
  · Maps each parquet circuit_id to GeoJSON circuit id
  · Normalizes GPS coords to SVG space (preserving aspect ratio)
  · Inverts Y axis (geographic lat increases up, SVG Y increases down)
  · Saves drs_zones_count per circuit from official FIA data
  · Output: circuit_track_maps.json (300–500 SVG points per circuit)
```

**Dataset stats:**

| Season | Laps | Notes |
|--------|------|-------|
| 2018 | 1,039 | First Ferrari season |
| 2019 | 1,141 | |
| 2020 | 795 | COVID-shortened calendar |
| 2021 | 1,120 | |
| 2022 | 1,153 | New regs, multiple wins |
| 2023 | 1,131 | |
| 2024 | 1,396 | Monaco GP win included |
| **Total** | **7,775** | **34 circuits** |

---

## Backend API

FastAPI app in `backend/main.py`. Read-only data routes live in `backend/routes/data.py`. The `ModelRegistry` loads all ML artifacts once at startup (Render cold start: ~30–60s on free tier).

| Method | Path | What it does |
|--------|------|-------------|
| `GET` | `/health` | Model load status, parquet row count — **Render health check** |
| `GET` | `/races` | All Leclerc races (year, round, circuit, finish position) |
| `GET` | `/race/{year}/{round}/laps` | Full lap data for a race (57+ fields per lap) |
| `GET` | `/circuit/track_map/{circuit_id}` | SVG polyline + viewBox + DRS zone count |
| `POST` | `/predict/next_lap` | LSTM inference → predicted lap time, deg rate, cliff prob |
| `POST` | `/predict/safety_car` | XGBoost ensemble → SC prob, VSC ratio, SHAP factors |
| `GET` | `/predict/weather/{circuit_id}` | Weather model → condition, lap delta, SC multiplier |
| `POST` | `/strategy/recommend` | PPO → action + Monte Carlo finishing distribution |
| `POST` | `/race/lap_tick` | Combined per-lap inference (used by replay loop) |
| `POST` | `/engineer/message` | Claude → team radio message from ML context |
| `GET` | `/engineer/prerace_strategy` | Pre-race brief with strategy options |
| `GET` | `/debug/model_versions` | Training history and active model artifacts |

---

## Frontend

The app is a single-page experience: a **GSAP scroll-driven landing** flows into the **pit wall dashboard** on the same page. Deep links like `/race/2024/8?lap=33` skip straight to a loaded race.

### Landing (scroll experience)

| Section | What it does |
|---------|----------------|
| **Intro splash** | Full-screen Ferrari red → `LECLERCAI` fade |
| **Hero** | Eyes image, morphing logo, tagline, scroll cue |
| **About** | Word-by-word reveal pinned on scroll |
| **How It Works** | Five horizontal cards (ML pillars) |
| **OPEN PIT WALL** | Spin-slider CTA → scrolls to dashboard |

Built with **GSAP ScrollTrigger**, scroll snap, custom red cursor, **Anton + DM Sans** fonts.

### Pit wall dashboard
┌────────────────────────────────────────────────────────────────────────┐
│  HEADER  — Lap counter · SC bar · Rain indicator · Race win glow       │
├──────────────────────────────────────────────────────────────────────  │
│                                                                        │
│  ┌──────────────┐  ┌──────────────────────────┐  ┌─────────────────┐   │
│  │ RACE SELECT  │  │                          │  │  TEAM RADIO     │   │
│  │              │  │    CIRCUIT MAP           │  │                 │   │
│  │ Season ▼     │  │    (real GPS coords)     │  │ ┌─────────────┐ │   │
│  │ Race ▼       │  │                          │  │ │ BOX CALL    │ │   │
│  │              │  │    ● car dot animates    │  │ │ LAP 28      │ │   │
│  │ [LOAD RACE]  │  │      around track        │  │ └─────────────┘ │   │
│  │              │  │      from S/F line       │  │ ┌─────────────┐ │   │
│  ├──────────────┤  │      each lap            │  │ │ ADVISORY    │ │   │
│  │ LAP CONTROLS │  │                          │  │ │ LAP 27      │ │   │
│  │              │  │                          │  │ └─────────────┘ │   │
│  │ ◄ PREV NEXT► │  └──────────────────────────┘  │ ┌─────────────┐ │   │
│  │ LAP 28 / 57  │                                │ │ ROUTINE     │ │   │
│  │ ▶ PLAY LAP   │                                │ │ LAP 26      │ │   │
│  │ 1× ▼ SPEED   │                                │ └─────────────┘ │   │
│  └──────────────┘                                │   (scrollable)  │   │
│                                                  └─────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  LAP TIMES chart  │  TYRE DEG (stint delta)  │  POSITION TRACKER│   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  STRATEGY TIMELINE (all stints, completed + future)             │   │
│  │  ██████████████████████▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒                │   │
│  │  SOFT (22 laps)       MED (18 laps)      HARD (future)          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────┐  ┌──────────────────────────────────┐  │
│  │  SAFETY CAR GAUGE          │  │  SC SHAP FACTORS                 │  │
│  │  ████░░░░░░ 35% risk       │  │  · Wet conditions ↑              │  │
│  └────────────────────────────┘  └──────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

**Key frontend features:**
- **OPEN PIT WALL button** — spin-slider interaction; navigates to dashboard and resets when you scroll back to hero
- **BOX BOX banner** — slides down with compound color when Leclerc actually pits in historical data, auto-dismisses after 3 seconds
- **Car animation** — snaps to start/finish line on each lap change, animates at correct speed (adjusts for 1×/2×/5× playback)
- **Tyre legend** — `● SOFT  ● MED  ● HARD  ● INTER  ● WET` below strategy timeline
- **Rain indicator** — teardrop icon fades in when `rainfall = 1`
- **Race win glow** — Ferrari red header glow + "RACE WIN" for P1 finishes
- **URL sync** — race year/round/lap reflected in the address bar for shareable links

**Tech stack:** React 18, TypeScript, Vite, React Router, Zustand, TanStack Query, Recharts, GSAP, Framer Motion, Axios, Tailwind, Vitest

---

## File Structure

```
ai_race_engineer/
│
├── README.md
├── render.yaml                          ← Render Blueprint (backend Docker service)
├── docker-compose.yml                   ← Local dev: backend + Vite frontend
├── docker-compose.prod.yml              ← Local prod: backend + nginx frontend
├── .github/workflows/ci.yml             ← Lint, test, build on push/PR
│
├── backend/
│   ├── main.py                          ← FastAPI app, ML endpoints, CORS, rate limit
│   ├── schemas.py                       ← Pydantic request/response models
│   ├── circuits.py                      ← Circuit ID → display name map
│   ├── utils.py
│   ├── requirements.txt
│   ├── requirements-dev.txt             ← pytest + dev deps (CI)
│   ├── Dockerfile                       ← Render + Docker Compose image
│   ├── .env                             ← ANTHROPIC_API_KEY (never commit)
│   │
│   ├── routes/
│   │   └── data.py                      ← /health, /races, laps, track maps
│   │
│   ├── models/                          ← Inference wrappers (loaded at startup)
│   │   ├── model_registry.py            ← Loads and wires all models
│   │   ├── lstm_model.py
│   │   ├── xgb_model.py
│   │   ├── rl_policy.py
│   │   └── weather_model.py
│   │
│   ├── features/
│   │   ├── feature_builder.py
│   │   └── validate_features.py
│   │
│   ├── simulation/
│   │   ├── race_sim.py
│   │   └── monte_carlo.py
│   │
│   ├── engineer/
│   │   └── radio_generator.py           ← Claude prompts + message priority
│   │
│   ├── tests/                           ← pytest (API, lap_tick, rate limit)
│   │
│   ├── training/                        ← CLI scripts — run locally, not on Render
│   │   ├── collect_data.py
│   │   ├── clean_data.py
│   │   ├── generate_track_maps.py
│   │   ├── train_lstm.py
│   │   ├── train_xgb.py
│   │   ├── train_weather_model.py
│   │   ├── train_rl.py
│   │   ├── leclerc_race_env.py
│   │   └── model_versioning.py
│   │
│   └── data/
│       ├── raw/                         ← FastF1 cache (gitignored)
│       ├── processed/
│       │   ├── leclerc_career_laps.parquet
│       │   └── circuit_track_maps.json
│       └── models/                      ← Trained weights (shipped in Docker image)
│
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── nginx.conf                       ← Used by Dockerfile.prod
    ├── Dockerfile.prod
    ├── .env                             ← VITE_API_BASE_URL (never commit)
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── routes/
        │   ├── AppRouter.tsx            ← `/` and `/race/:year/:round`
        │   └── useRaceUrlSync.ts        ← URL ↔ lap state
        ├── pages/RaceDashboard.tsx
        ├── components/
        │   ├── landing/                 ← IntroSplash, Hero, About, HowItWorks, PitWallButton
        │   ├── layout/                  ← TimingStrip, MainLayout
        │   ├── dashboard/
        │   ├── telemetry/
        │   ├── strategy/
        │   ├── safety/
        │   ├── track/
        │   ├── engineer/
        │   ├── ui/
        │   └── common/
        ├── hooks/
        │   ├── useRaceReplay.ts         ← Lap stepping + API orchestration
        │   ├── useRaceLoader.ts
        │   ├── useLandingScroll.ts      ← GSAP scroll choreography
        │   └── useMotionSafe.ts
        ├── replay/                      ← lapContext, playbackClock, lapMath
        ├── store/raceStore.ts
        ├── api/client.ts                ← Axios + typed API helpers
        ├── design/tokens.ts
        └── styles/landing.css
```

---

## Setup & Run (Local)

### Prerequisites

- Python 3.11+
- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com) (for engineer radio)

### Backend

```bash
# Clone and install
git clone https://github.com/vishwakvel/ai_race_engineer.git
cd ai_race_engineer

python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt

# Set your API key
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" > backend/.env

# Run (from repo root — important for package imports)
uvicorn backend.main:app --reload --port 8000
```

API docs available at **http://localhost:8000/docs**

### Frontend

```bash
cd frontend
npm install
echo "VITE_API_BASE_URL=http://localhost:8000" > .env
npm run dev
```

App available at **http://localhost:5173**

### Optional environment overrides

```bash
DATA_DIR=/path/to/parquet/folder    # default: backend/data/processed
MODEL_DIR=/path/to/models/folder    # default: backend/data/models
F1_CACHE_DIR=/path/to/f1/cache      # default: backend/data/raw/f1_cache
```

---

## Training Pipeline

If you want to build everything from scratch (this takes several hours for the full pipeline):

```bash
# 1. Collect raw lap data from FastF1 (2018–2024)
#    Downloads ~1GB of session data, cached for reuse
python -m backend.training.collect_data

# 2. Build the main parquet dataset + all JSON artifacts
#    ~1 minute. Outputs: leclerc_career_laps.parquet
python -m backend.training.clean_data

# 3. Generate real circuit track maps from GeoJSON
#    Downloads bacinger/f1-circuits and processes 34 circuits
python -m backend.training.generate_track_maps

# 4. Validate feature consistency (run after every retrain)
python -m backend.features.validate_features
# Must print: "PASS — feature consistency OK"

# 5. Train the LSTM tyre model (~30–60 minutes)
python -m backend.training.train_lstm
# Target: test RMSE < 3.5s

# 6. Train XGBoost safety car model (~5 minutes)
python -m backend.training.train_xgb
# Target: AUC > 0.72, Brier < 0.05

# 7. Train weather correction models (~2 minutes)
python -m backend.training.train_weather_model

# 8. Train PPO strategy policy (~1–4 hours)
#    Watch ep_rew_mean — it should reach > 35
python -m backend.training.train_rl

# 9. Restart backend to load new models
kill $(lsof -ti :8000) && uvicorn backend.main:app --reload --port 8000
```

**Model versioning:** Every training run saves a timestamped copy of the model and logs metrics to `model_versions.json`. If a new training run produces worse results, the previous weights are preserved. Check training history at `GET /debug/model_versions`.

---

## Environment Variables

| Variable | Where | Required | Purpose |
|----------|-------|----------|---------|
| `ANTHROPIC_API_KEY` | `backend/.env` (local) · Render dashboard (prod) | ✅ Yes | Claude for `/engineer/message` |
| `VITE_API_BASE_URL` | `frontend/.env` (local) · Vercel dashboard (prod) | ✅ Yes | Backend URL for axios |
| `DATA_DIR` | shell / Docker / Render | Optional | Override parquet location |
| `MODEL_DIR` | shell / Docker / Render | Optional | Override model artifacts location |
| `F1_CACHE_DIR` | shell (training only) | Optional | FastF1 cache path for `collect_data.py` |
| `RATE_LIMIT_PER_MINUTE` | Render / shell | Optional | API rate limit (default `240`) |
| `PORT` | Render (auto) | — | Do not set manually on Render |

**Render:** only `ANTHROPIC_API_KEY` is required in the dashboard — path env vars have sensible Dockerfile defaults.

**Vercel:** only `VITE_API_BASE_URL` pointing at your Render service URL.

**Secret files:** not used anywhere in this project.

---

## Docker (Local)

### Development

```bash
docker compose up --build
```

This starts both services:
- **Backend** on port **8000** — mounts `./backend/data` → `/app/data` (compose overrides `DATA_DIR` / `MODEL_DIR`)
- **Frontend** on port **5173** — Vite dev server, depends on backend

Set `ANTHROPIC_API_KEY` in `backend/.env` for live engineer radio messages.

### Production-like (local)

```bash
docker compose -f docker-compose.prod.yml up --build
```

- **Backend** on port **8000**
- **Frontend** on port **8080** — nginx serving the static Vite build

The prod compose build uses `VITE_API_BASE_URL=http://localhost:8000`. For a remote API, change the build arg in `docker-compose.prod.yml`.

Deep links such as `/race/2024/8?lap=33` work — nginx falls back to `index.html` for client-side routing.

> **Production hosting** uses Vercel + Render, not Docker Compose. See [Production Deployment](#production-deployment).

---

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main` and on pull requests:

| Job | Steps |
|-----|--------|
| **frontend** | `npm ci` → lint → typecheck → Vitest → build |
| **backend** | pip install → `pytest backend/tests/` |

No deploy step in CI — Vercel and Render auto-deploy from `main` when connected to GitHub.

---

## Message Types Reference

The engineer generates different messages based on race situation. Priority order (highest to lowest):

| Type | Urgency | Trigger |
|------|---------|---------|
| `RACE_END` | — | Final lap completed |
| `SC_BOX_CALL` | 🔴 URGENT | Safety car deployed + pit recommended |
| `RAIN_STARTING` | 🔴 URGENT | `rainfall` flips from 0 → 1 |
| `BOX_CALL` | 🔴 URGENT | PPO recommends pit, tyre age ≥ 18, confidence > 0.78 |
| `CLIFF_WARNING` | 🟡 ADVISORY | `cliff_probability` > 0.35 |
| `SC_ALERT` | 🟡 ADVISORY | `sc_probability` > 0.40 |
| `POSITION_GAINED` | ⚪ ROUTINE | `position` improved vs previous lap |
| `DRS_AVAILABLE` | ⚪ ROUTINE | `gap_ahead` ≤ 1.0s, DRS zones > 0 |
| `RAIN_STOPPING` | ⚪ ROUTINE | `rainfall` flips from 1 → 0 |
| `TYRE_ADVISORY` | ⚪ ROUTINE | `deg_rate` > 0.25 tenths/lap |
| `CLOSE_AHEAD` | ⚪ ROUTINE | `gap_ahead` ≤ 1.2s |
| `PRESSURE_BEHIND` | ⚪ ROUTINE | `gap_behind` ≤ 0.8s |
| `ROUTINE_PACE_NOTE` | ⚪ ROUTINE | Default (every 2–3 laps) |
