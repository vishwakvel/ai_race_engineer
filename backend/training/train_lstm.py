"""
Train LSTM tyre degradation model.
Run: python -m backend.training.train_lstm
"""

import os
import json
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.environ.get("DATA_DIR", os.path.join(_BACKEND_DIR, "data", "processed"))
MODELS_DIR = os.environ.get("MODEL_DIR", os.path.join(_BACKEND_DIR, "data", "models"))
PARQUET_PATH = os.path.join(DATA_DIR, "leclerc_career_laps.parquet")

SEQ_LEN = 10


def build_lstm_sequence_from_laps(seq_laps: list, norm_stats: dict, seq_len: int = SEQ_LEN):
    """Build (numeric_seq, compound_seq); lap_time_seconds is circuit z-score."""
    from backend.features.feature_builder import FeatureBuilder
    numeric_seq = np.zeros((seq_len, len(FeatureBuilder.NUMERIC_FEATURES)), dtype=np.float32)
    compound_seq = np.zeros(seq_len, dtype=np.int64)
    ns = norm_stats

    def norm(val, key):
        s = ns.get(key, {})
        return (float(val) - s.get("mean", 0.0)) / (s.get("std", 1.0) + 1e-8)

    start = max(0, seq_len - len(seq_laps))
    for i, lap in enumerate(seq_laps[-seq_len:]):
        tt = float(lap.get("track_temp_celsius", lap.get("track_temp", 35.0)))
        at = float(lap.get("air_temp_celsius", lap.get("air_temp", 25.0)))
        numeric_seq[start + i] = [
            float(lap["lap_time_seconds"]),
            norm(lap.get("tyre_age", 0), "tyre_age"),
            norm(lap.get("fuel_load_kg", 80), "fuel_load_kg"),
            norm(tt, "track_temp_celsius"),
            norm(at, "air_temp_celsius"),
            norm(min(float(lap.get("gap_ahead_seconds", 0)), 120.0), "gap_ahead_seconds"),
            norm(min(float(lap.get("gap_behind_seconds", 0)), 120.0), "gap_behind_seconds"),
            float(lap.get("safety_car_active", 0)),
            norm(float(lap.get("wind_speed", 0)), "wind_speed"),
            float(lap.get("fresh_tyre", 1)),
        ]
        compound_seq[start + i] = int(lap.get("compound", 0))
    return numeric_seq, compound_seq


def _row_to_lap_dict(row) -> dict:
    """Lap dict for LSTM input: lap_time_seconds holds circuit z-score (lap_time_normalized)."""
    lt_n = float(row.get("lap_time_normalized", 0.0))
    if pd.isna(lt_n):
        lt_n = 0.0
    return {
        "lap_time_seconds": lt_n,
        "compound": int(row["compound"]),
        "tyre_age": int(row["tyre_age"]),
        "fuel_load_kg": float(row["fuel_load_kg"]),
        "track_temp_celsius": float(row.get("track_temp_celsius", row.get("track_temp", 35.0))),
        "air_temp_celsius": float(row.get("air_temp_celsius", row.get("air_temp", 25.0))),
        "gap_ahead_seconds": float(row.get("gap_ahead_seconds", 0)),
        "gap_behind_seconds": float(row.get("gap_behind_seconds", 0)),
        "safety_car_active": int(row.get("safety_car_active", 0)),
        "wind_speed": float(row.get("wind_speed", 0) or 0),
        "fresh_tyre": int(row.get("fresh_tyre", 1) or 1),
    }


class StintDataset(Dataset):
    """
    Sliding window sequences; targets are circuit-normalized next lap (z-score).
    """

    def __init__(self, df: pd.DataFrame, norm_stats: dict):
        self.norm_stats = norm_stats
        self.samples = []

        self.df = df[df["exclude_from_lstm_training"] == 0].copy()
        numeric_cols = [
            "lap_time_seconds",
            "lap_time_normalized",
            "tyre_age",
            "fuel_load_kg",
            "track_temp",
            "air_temp",
            "gap_ahead_seconds",
            "gap_behind_seconds",
            "safety_car_active",
            "track_temp_celsius",
            "air_temp_celsius",
            "circuit_lt_mean",
            "circuit_lt_std",
        ]
        for col in numeric_cols:
            if col in self.df.columns:
                self.df[col] = self.df[col].fillna(self.df[col].median()).fillna(0.0)

        self.df = self.df.dropna(subset=["lap_time_seconds", "lap_time_normalized"])
        for (sid, stint), g in self.df.groupby(["session_id", "stint_number"]):
            g = g.sort_values("lap_number").reset_index(drop=True)
            if len(g) < 2:
                continue
            laps_list = [_row_to_lap_dict(g.iloc[j]) for j in range(len(g))]
            for i in range(len(g) - 1):
                next_row = g.iloc[i + 1]
                next_lt_norm = float(next_row["lap_time_normalized"])
                curr_lt_norm = float(g.iloc[i]["lap_time_normalized"])
                deg_sec = next_lt_norm - curr_lt_norm
                cliff = 0.0
                if i + 2 < len(g):
                    lt_i1 = float(g.iloc[i + 1]["lap_time_normalized"])
                    lt_i2 = float(g.iloc[i + 2]["lap_time_normalized"])
                    if lt_i2 - lt_i1 > 0.15:
                        cliff = 1.0
                seq_laps = laps_list[max(0, i - SEQ_LEN + 1) : i + 1]
                target_lt_norm = float(next_row["lap_time_normalized"])
                lt_mean = float(next_row.get("circuit_lt_mean", 91.5))
                lt_std = float(next_row.get("circuit_lt_std", 5.0))
                self.samples.append((seq_laps, target_lt_norm, deg_sec, cliff, lt_mean, lt_std))

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        seq_laps, target_lap_time, deg_sec, cliff, lt_mean, lt_std = self.samples[idx]
        numeric_seq, compound_seq = build_lstm_sequence_from_laps(
            seq_laps, self.norm_stats, seq_len=SEQ_LEN
        )
        numeric_seq = np.nan_to_num(numeric_seq, nan=0.0, posinf=0.0, neginf=0.0)
        target_lap_time = float(np.nan_to_num(target_lap_time, nan=0.0))
        target_deg_rate = float(np.nan_to_num(deg_sec / 2.0, nan=0.0))
        target_cliff = float(np.nan_to_num(cliff, nan=0.0))
        return (
            torch.FloatTensor(numeric_seq),
            torch.LongTensor(compound_seq),
            torch.FloatTensor([target_lap_time]),
            torch.FloatTensor([target_deg_rate]),
            torch.FloatTensor([target_cliff]),
            torch.FloatTensor([lt_mean]),
            torch.FloatTensor([lt_std]),
        )


class TyreDegradationLSTM(nn.Module):
    def __init__(
        self,
        input_size: int = 10,
        embedding_dim: int = 4,
        hidden_size: int = 128,
        num_layers: int = 3,
        dropout: float = 0.25,
    ):
        super().__init__()
        self.compound_embedding = nn.Embedding(5, embedding_dim)
        self.lstm = nn.LSTM(
            input_size=input_size + embedding_dim,
            hidden_size=hidden_size,
            num_layers=num_layers,
            dropout=dropout if num_layers > 1 else 0,
            batch_first=True,
        )
        self.output_head = nn.Sequential(
            nn.Linear(hidden_size, 32),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(32, 3),
        )

    def forward(self, numeric_seq, compound_seq):
        embed = self.compound_embedding(compound_seq)
        x = torch.cat([numeric_seq, embed], dim=-1)
        lstm_out, _ = self.lstm(x)
        last = lstm_out[:, -1, :]
        return self.output_head(last)


def main():
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

    from backend.features.feature_builder import compute_norm_stats

    os.makedirs(MODELS_DIR, exist_ok=True)
    if not os.path.exists(PARQUET_PATH):
        print("Parquet not found. Run clean_data first.")
        return

    df = pd.read_parquet(PARQUET_PATH)
    if "lap_time_normalized" not in df.columns:
        print("[LSTM] Missing lap_time_normalized. Re-run: python -m backend.training.clean_data")
        return

    print(f"[LSTM] Dataset shape: {df.shape}")
    print("[LSTM] NaN counts in key columns:")
    key_cols = ["lap_time_seconds", "tyre_age", "fuel_load_kg", "compound", "lap_time_normalized"]
    for col in key_cols:
        if col in df.columns:
            n = int(df[col].isna().sum())
            pct = (100 * n / len(df)) if len(df) else 0.0
            print(f"  {col}: {n} NaN ({pct:.1f}%)")
    inf_count = np.isinf(df.select_dtypes(include=[np.number])).sum().sum()
    print(f"[LSTM] Total inf values across all numeric columns: {inf_count}")

    df["track_temp_celsius"] = df.get("track_temp_celsius", df.get("track_temp", 35.0))
    df["air_temp_celsius"] = df.get("air_temp_celsius", df.get("air_temp", 25.0))

    train_df = df[(df["year"] >= 2018) & (df["year"] <= 2022)].copy()
    val_df = df[df["year"] == 2023].copy()
    test_df = df[df["year"] == 2024].copy()
    for _sub in (train_df, val_df, test_df):
        if "wind_speed" not in _sub.columns:
            _sub["wind_speed"] = 0.0
        _sub["wind_speed"] = pd.to_numeric(_sub["wind_speed"], errors="coerce").fillna(0.0)
        if "fresh_tyre" not in _sub.columns:
            _sub["fresh_tyre"] = 1
        _sub["fresh_tyre"] = pd.to_numeric(_sub["fresh_tyre"], errors="coerce").fillna(1).astype(int).clip(0, 1)

    norm_stats = compute_norm_stats(train_df)

    with open(os.path.join(MODELS_DIR, "lstm_norm_stats.json"), "w") as f:
        json.dump(norm_stats, f, indent=2)
    print("[LSTM] Norm stats saved (lap time in sequences is circuit z-score; not re-z-scored).")

    train_ds = StintDataset(train_df, norm_stats)
    val_ds = StintDataset(val_df, norm_stats)
    test_ds = StintDataset(test_df, norm_stats)

    if len(train_ds) == 0:
        print("No training samples. Check data and exclude_from_lstm_training.")
        return

    sample = train_ds[0]
    print("[LSTM] Sample input check:")
    print(f"  numeric_seq[0] (first timestep): {sample[0][0].numpy()}")
    print(f"  compound_seq[0]: {sample[1][0].item()}")
    print(f"  target_lt (z-score): {sample[2].item():.3f}")
    print(f"  target_deg: {sample[3].item():.3f}")
    print(f"  lt_mean: {sample[5].item():.1f}s  lt_std: {sample[6].item():.1f}s")
    print("  Expected: lap_time z-score in roughly -2 to +2 range")

    train_loader = DataLoader(train_ds, batch_size=64, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=64, shuffle=False, num_workers=0)
    test_loader = DataLoader(test_ds, batch_size=64, shuffle=False, num_workers=0)

    from backend.features.feature_builder import FeatureBuilder
    config = {
        "input_size": len(FeatureBuilder.NUMERIC_FEATURES),
        "embedding_dim": 4,
        "hidden_size": 128,
        "num_layers": 3,
        "dropout": 0.25,
    }
    model = TyreDegradationLSTM(**config)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.0005)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=5, factor=0.5)

    def combined_loss(pred, target_lt, target_deg, target_cliff):
        lt_loss = F.mse_loss(pred[:, 0], target_lt.squeeze())
        deg_loss = F.mse_loss(pred[:, 1], target_deg.squeeze())
        cliff_loss = F.binary_cross_entropy_with_logits(pred[:, 2], target_cliff.squeeze())
        return lt_loss + deg_loss + (0.5 * cliff_loss)

    best_val = float("inf")
    patience_counter = 0
    max_patience = 10
    n_epochs = 80

    for epoch in range(n_epochs):
        model.train()
        train_loss = 0.0
        for num, comp, t_lt, t_deg, t_cliff, _, _ in train_loader:
            optimizer.zero_grad()
            out = model(num, comp)
            loss = combined_loss(out, t_lt, t_deg, t_cliff)
            if torch.isnan(loss):
                print("[LSTM] ERROR: NaN loss detected. Check for NaN values in input data.")
                print(f"  numeric_seq sample: {num[0, 0, :4]}")
                print(f"  target_lap_time sample: {t_lt[0]}")
                raise ValueError("NaN loss — training aborted")
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            train_loss += loss.item()
        train_loss /= len(train_loader)

        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for num, comp, t_lt, t_deg, t_cliff, _, _ in val_loader:
                out = model(num, comp)
                val_loss += combined_loss(out, t_lt, t_deg, t_cliff).item()
        val_loss /= max(len(val_loader), 1)
        scheduler.step(val_loss)

        if val_loss < best_val:
            best_val = val_loss
            patience_counter = 0
            torch.save(model.state_dict(), os.path.join(MODELS_DIR, "lstm_weights.pt"))
        else:
            patience_counter += 1
        if (epoch + 1) % 10 == 0:
            print(f"Epoch {epoch+1} train_loss={train_loss:.4f} val_loss={val_loss:.4f}")
        if patience_counter >= max_patience:
            print(f"Early stopping at epoch {epoch+1}")
            break

    weights_path = os.path.join(MODELS_DIR, "lstm_weights.pt")
    if os.path.exists(weights_path):
        model.load_state_dict(torch.load(weights_path, map_location="cpu"))
        print("[LSTM] Loaded best weights for final evaluation")
    else:
        print("[LSTM] WARNING: No weights file found — training may have failed due to NaN loss")
        return

    with open(os.path.join(MODELS_DIR, "lstm_config.json"), "w") as f:
        json.dump(config, f, indent=2)

    model.eval()
    all_errors = []
    test_cliff_probs = []
    test_cliff_labels = []
    with torch.no_grad():
        for num, comp, target_lt, target_deg, target_cliff, lt_means, lt_stds in test_loader:
            output = model(num, comp)
            pred_seconds = output[:, 0] * lt_stds.squeeze().to(output.device) + lt_means.squeeze().to(
                output.device
            )
            true_seconds = target_lt.squeeze() * lt_stds.squeeze().to(output.device) + lt_means.squeeze().to(
                output.device
            )
            err = (pred_seconds - true_seconds) ** 2
            all_errors.extend(err.cpu().numpy().ravel().tolist())
            test_cliff_probs.extend(torch.sigmoid(output[:, 2]).numpy().ravel().tolist())
            test_cliff_labels.extend(target_cliff.numpy().ravel().tolist())

    rmse = float(np.sqrt(np.mean(all_errors))) if all_errors else 0.0
    from sklearn.metrics import roc_auc_score

    cliff_auc = roc_auc_score(test_cliff_labels, test_cliff_probs) if sum(test_cliff_labels) > 0 else 0.0
    print(f"[LSTM] Test RMSE: {rmse:.3f}s | Cliff AUC: {cliff_auc:.2f}")

    try:
        from backend.training.model_versioning import save_timestamped_copy, update_model_versions

        ts = __import__("datetime").datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        wcopy = save_timestamped_copy(MODELS_DIR, "lstm_weights.pt", ts)
        if wcopy:
            update_model_versions(MODELS_DIR, "lstm", wcopy, {"rmse": rmse, "cliff_auc": cliff_auc})
    except Exception as e:
        print("[LSTM] model versioning skip:", e)


if __name__ == "__main__":
    main()
