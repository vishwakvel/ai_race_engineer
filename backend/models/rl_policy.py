"""PPO reinforcement learning policy for pit strategy recommendation."""

import os
import numpy as np

ACTION_NAMES = {0: "STAY_OUT", 1: "PIT_SOFT", 2: "PIT_MEDIUM", 3: "PIT_HARD"}


class RLPolicy:
    """
    Pit strategy policy. Given current race state (observation vector),
    returns recommended action and confidence.
    """

    def __init__(self, models_dir: str) -> None:
        self.models_dir = models_dir
        self.model = None
        self.loaded = False

    def load(self) -> None:
        """Load PPO model from disk. Graceful if missing."""
        path = os.path.join(self.models_dir, "ppo_strategy_policy.zip")
        if not os.path.exists(path):
            path = os.path.join(self.models_dir, "ppo_strategy_policy_best.zip")
        if not os.path.exists(path):
            print("[RLPolicy] WARNING: PPO model not found. Using fallback.")
            return
        from stable_baselines3 import PPO
        self.model = PPO.load(path)
        self.loaded = True
        print("[RLPolicy] Loaded successfully.")

    def predict(self, observation: np.ndarray, deterministic: bool = True) -> dict:
        """
        observation: 12-dim normalized array from FeatureBuilder.build_rl_observation.
        Returns: {action, action_name, action_probabilities, confidence}
        """
        if not self.loaded:
            return {
                "action": 0,
                "action_name": "STAY_OUT",
                "action_probabilities": {"STAY_OUT": 0.7, "PIT_SOFT": 0.1, "PIT_MEDIUM": 0.1, "PIT_HARD": 0.1},
                "confidence": 0.7,
            }
        obs = np.asarray(observation, dtype=np.float32).ravel()
        expected_dim = self.model.observation_space.shape[0]
        if obs.shape[0] > expected_dim:
            obs = obs[:expected_dim]
        elif obs.shape[0] < expected_dim:
            obs = np.pad(obs, (0, expected_dim - obs.shape[0]), mode="constant", constant_values=0.0)
        action, _ = self.model.predict(obs, deterministic=deterministic)
        action = int(action)
        try:
            import torch
            obs_t = torch.FloatTensor(obs).unsqueeze(0)
            with torch.no_grad():
                dist = self.model.policy.get_distribution(obs_t)
                probs = dist.distribution.probs[0].numpy()
        except Exception:
            probs = np.array([0.25] * 4)
        action_probs = {ACTION_NAMES[i]: float(probs[i]) for i in range(4)}
        return {
            "action": action,
            "action_name": ACTION_NAMES[action],
            "action_probabilities": action_probs,
            "confidence": float(probs[action]),
        }
