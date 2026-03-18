"""
Train PPO pit strategy policy in LeclercRaceEnv.
Run: python -m backend.training.train_rl
"""

import os
import sys

# Ensure project root on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from stable_baselines3 import PPO
from stable_baselines3.common.env_checker import check_env
from stable_baselines3.common.callbacks import EvalCallback
from stable_baselines3.common.monitor import Monitor

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.environ.get("DATA_DIR", os.path.join(_BACKEND_DIR, "data", "processed"))
MODELS_DIR = os.environ.get("MODEL_DIR", os.path.join(_BACKEND_DIR, "data", "models"))
PARQUET_PATH = os.path.join(DATA_DIR, "leclerc_career_laps.parquet")
SAVE_PATH = os.path.join(MODELS_DIR, "ppo_strategy_policy")
LOG_PATH = os.path.join(MODELS_DIR, "ppo_logs")


def main():
    from backend.training.leclerc_race_env import LeclercRaceEnv

    if not os.path.exists(PARQUET_PATH):
        print("Parquet not found. Run clean_data and collect_data first.")
        return

    os.makedirs(MODELS_DIR, exist_ok=True)
    os.makedirs(LOG_PATH, exist_ok=True)

    env = LeclercRaceEnv(PARQUET_PATH, MODELS_DIR)
    check_env(env)
    env = Monitor(env, filename=os.path.join(LOG_PATH, "train"))

    eval_env = LeclercRaceEnv(PARQUET_PATH, MODELS_DIR)
    eval_env = Monitor(eval_env)

    eval_callback = EvalCallback(
        eval_env,
        best_model_save_path=SAVE_PATH + "_best",
        log_path=LOG_PATH,
        eval_freq=10_000,
        n_eval_episodes=20,
        deterministic=True,
        verbose=1,
    )

    model = PPO(
        "MlpPolicy",
        env,
        learning_rate=3e-4,
        n_steps=2048,
        batch_size=64,
        n_epochs=10,
        gamma=0.99,
        gae_lambda=0.95,
        clip_range=0.2,
        ent_coef=0.05,
        vf_coef=0.5,
        max_grad_norm=0.5,
        verbose=1,
        tensorboard_log=LOG_PATH,
    )

    # 200k = quick validation (target ep_rew_mean > ~10 by ~100k). Set RL_FULL_RUN=1 for 1M.
    total_ts = 1_000_000 if os.environ.get("RL_FULL_RUN", "").strip() == "1" else 200_000
    print(
        f"[PPO] Starting training ({total_ts} steps). Full run: RL_FULL_RUN=1. tensorboard --logdir",
        LOG_PATH,
    )
    model.learn(
        total_timesteps=total_ts,
        callback=eval_callback,
        progress_bar=True,
    )

    model.save(SAVE_PATH)
    print(f"[PPO] Saved to {SAVE_PATH}.zip")
    try:
        from backend.training.model_versioning import save_timestamped_copy, update_model_versions
        from datetime import datetime

        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        src = SAVE_PATH + ".zip"
        if os.path.exists(src):
            import shutil

            dest = os.path.join(MODELS_DIR, f"ppo_strategy_policy_{ts}.zip")
            shutil.copy2(src, dest)
            update_model_versions(MODELS_DIR, "ppo", os.path.basename(dest), {})
    except Exception as e:
        print("[PPO] versioning:", e)


if __name__ == "__main__":
    main()
