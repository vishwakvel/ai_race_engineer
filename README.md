```
                ██╗     ███████╗ ██████╗██╗     ███████╗██████╗  ██████╗    █████╗ ██╗
                ██║     ██╔════╝██╔════╝██║     ██╔════╝██╔══██╗██╔════╝   ██╔══██╗██║
                ██║     █████╗  ██║     ██║     █████╗  ██████╔╝██║        ███████║██║
                ██║     ██╔══╝  ██║     ██║     ██╔══╝  ██╔══██╗██║        ██╔══██║██║
                ███████╗███████╗╚██████╗███████╗███████╗██║  ██║╚██████╗   ██║  ██║██║
                ╚══════╝╚══════╝ ╚═════╝╚══════╝╚══════╝╚═╝  ╚═╝ ╚═════╝   ╚═╝  ╚═╝╚═╝
```

###                       *The AI race engineer Charles deserves*

---

## Table of Contents

1. [Architecture](#architecture)
2. [Machine Learning Stack](#machine-learning-stack)
3. [How It All Connects](#how-it-all-connects)
4. [Data Pipeline](#data-pipeline)
5. [Backend API](#backend-api)
6. [Frontend Dashboard](#frontend-dashboard)
7. [File Structure](#file-structure)
8. [Setup & Run](#setup--run)
9. [Training Pipeline](#training-pipeline)
10. [Environment Variables](#environment-variables)
11. [Docker](#docker)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                        BROWSER — React + TypeScript                         │
│                                                                             │
│   ┌─────────────┐  ┌───────────────────────────────────────────────────┐    │
│   │  Homepage   │  │               Race Dashboard                      │    │
│   │             │  │                                                   │    │
│   │  · Hero     │  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │    │
│   │  · Stats    │  │  │ Race     │ │ Circuit  │ │  Engineer Panel   │  │    │
│   │  · Features │  │  │ Selector │ │   Map    │ │                   │  │    │
│   │             │  │  │          │ │          │ │  ┌─────────────┐  │  │    │
│   └─────────────┘  │  │ Lap      │ │  Car dot │ │  │ Radio feed  │  │  │    │
│                    │  │ Controls │ │  animates│ │  │ scrollable  │  │  │    │
│                    │  └──────────┘ └──────────┘ │  └─────────────┘  │  │    │
│                    │                            └───────────────────┘  │    │
│                    │  ┌───────────────────────────────────────────────┐│    │
│                    │  │  Lap Times · Tyre Deg · Position · SC Gauge   ││    │
│                    │  │  Strategy Timeline · Pit Window               ││    │
│                    │  └───────────────────────────────────────────────┘│    │
│                    └───────────────────────────────────────────────────┘    │
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

All endpoints are served from `backend/main.py` (FastAPI). The `ModelRegistry` loads everything at startup.

| Method | Path | What it does |
|--------|------|-------------|
| `GET` | `/health` | Model load status, parquet row count, cache stats |
| `GET` | `/races` | All Leclerc races (year, round, circuit, finish position) |
| `GET` | `/race/{year}/{round}/laps` | Full lap data for a race (57+ fields per lap) |
| `GET` | `/circuit/track_map/{circuit_id}` | SVG polyline + viewBox + DRS zone count |
| `POST` | `/predict/next_lap` | LSTM inference → predicted lap time, deg rate, cliff prob |
| `POST` | `/predict/safety_car` | XGBoost ensemble → SC prob, VSC ratio, SHAP factors |
| `GET` | `/predict/weather/{circuit_id}` | Weather model → condition, lap delta, SC multiplier |
| `POST` | `/strategy/recommend` | PPO → action + Monte Carlo finishing distribution |
| `POST` | `/engineer/message` | Claude → team radio message from ML context |
| `GET` | `/engineer/prerace_strategy` | Pre-race brief with strategy options |
| `GET` | `/debug/model_versions` | Training history and active model artifacts |

---

## Frontend Dashboard

```
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
- **BOX BOX banner** — slides down with compound color when Leclerc actually pits in historical data, auto-dismisses after 3 seconds
- **Car animation** — snaps to start/finish line on each lap change, animates at correct speed (adjusts for 1×/2×/5× playback)
- **Tyre legend** — `● SOFT  ● MED  ● HARD  ● INTER  ● WET` below strategy timeline
- **Rain indicator** — teardrop icon fades in when `rainfall = 1`
- **Race win glow** — Ferrari red header glow + "RACE WIN" for P1 finishes

**Tech stack:** React 18, TypeScript, Vite, Zustand, Recharts, Framer Motion, Axios, Tailwind

---

## File Structure

```
ai_race_engineer/
│
├── README.md
├── docker-compose.yml
│
├── backend/
│   ├── main.py                          ← FastAPI app, all endpoints, lifespan
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env                             ← ANTHROPIC_API_KEY (never commit this)
│   │
│   ├── models/                          ← Inference wrappers (loaded at startup)
│   │   ├── model_registry.py            ← Loads and wires all models
│   │   ├── lstm_model.py                ← LSTM wrapper + denormalization
│   │   ├── xgb_model.py                 ← XGBoost ensemble + SHAP
│   │   ├── rl_policy.py                 ← PPO wrapper + shape safety check
│   │   └── weather_model.py             ← Weather correction models
│   │
│   ├── features/
│   │   ├── feature_builder.py           ← LSTM sequence builder + RL observation
│   │   └── validate_features.py         ← Train-serve consistency check
│   │
│   ├── simulation/
│   │   ├── race_sim.py                  ← Lap-by-lap simulator
│   │   └── monte_carlo.py               ← Parallel 50-sim finishing distribution
│   │
│   ├── engineer/
│   │   └── radio_generator.py           ← Claude prompts, message types, priority
│   │
│   ├── training/                        ← Run these to build from scratch
│   │   ├── collect_data.py              ← FastF1 → raw CSVs
│   │   ├── clean_data.py                ← CSVs → parquet + JSON artifacts
│   │   ├── generate_track_maps.py       ← GeoJSON → circuit_track_maps.json
│   │   ├── train_lstm.py                ← Trains TyreDegradationLSTM
│   │   ├── train_xgb.py                 ← Trains XGBoost + LR ensemble
│   │   ├── train_weather_model.py       ← Trains weather correction models
│   │   ├── train_rl.py                  ← Trains PPO policy (SB3)
│   │   ├── leclerc_race_env.py          ← Gymnasium environment
│   │   └── model_versioning.py          ← Timestamps + metrics tracking
│   │
│   └── data/
│       ├── raw/                         ← FastF1 cache + CSVs (gitignored)
│       ├── processed/
│       │   ├── leclerc_career_laps.parquet   ← Main dataset
│       │   └── circuit_track_maps.json        ← SVG circuit coordinates
│       └── models/
│           ├── lstm_weights.pt + lstm_config.json + lstm_norm_stats.json
│           ├── xgb_sc_model.pkl + lr_sc_model.pkl + xgb_feature_names.json
│           ├── ppo_strategy_policy.zip
│           ├── weather_lap_model.pkl + weather_sc_model.pkl
│           ├── circuit_lap_stats.json         ← Per-circuit mean/std
│           ├── circuit_pit_loss.json          ← Data-driven pit time loss
│           ├── circuit_battle_intensity.json  ← Data-driven midfield gaps
│           ├── circuit_vsc_ratio.json         ← VSC vs full SC per circuit
│           └── model_versions.json            ← Training history + active ptr
│
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── .env                             ← VITE_API_BASE_URL (never commit)
    └── src/
        ├── App.tsx                      ← Landing + scroll to dashboard
        ├── pages/RaceDashboard.tsx      ← Main 3-column grid
        ├── hooks/
        │   └── useRaceReplay.ts         ← Lap stepping + all API calls
        ├── store/raceStore.ts           ← Zustand: laps, messages, pit events
        ├── api/client.ts                ← Axios instance + typed helpers
        ├── types/index.ts               ← Shared TypeScript types
        └── components/
            ├── layout/Header.tsx
            ├── homepage/                ← Hero, StatsStrip, FeatureSection
            ├── dashboard/               ← RaceSelectionCard
            ├── telemetry/               ← LapTimeChart, TyreDegCard, PositionTracker
            ├── strategy/                ← StrategyTimeline
            ├── safety/                  ← SafetyCarGauge
            ├── track/                   ← TrackMap (animated car dot)
            ├── engineer/                ← EngineerPanel, RadioMessage, BoxBoxBanner
            └── common/                  ← TyreLegend
```

---

## Setup & Run

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

| Variable | File | Required | Purpose |
|----------|------|----------|---------|
| `ANTHROPIC_API_KEY` | `backend/.env` | ✅ Yes | Claude for `/engineer/message` |
| `VITE_API_BASE_URL` | `frontend/.env` | ✅ Yes | Backend URL for axios |
| `DATA_DIR` | shell / backend | Optional | Override parquet location |
| `MODEL_DIR` | shell / backend | Optional | Override model artifacts location |
| `F1_CACHE_DIR` | shell / backend | Optional | Override FastF1 cache path |

> ⚠️ **Never commit `.env` files.** Both are in `.gitignore`. Your Anthropic API key is sensitive — if it ends up in git history, rotate it immediately at [console.anthropic.com](https://console.anthropic.com).

---

## Docker

```bash
docker compose up --build
```

This starts both services:
- **Backend** on port **8000** — mounts `./backend/data` → `/app/data`
- **Frontend** on port **5173** — depends on backend service

For production deployment, set `ANTHROPIC_API_KEY` in a `.env` file at the repo root before running compose.

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