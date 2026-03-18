"""
Monte Carlo wrapper: run N simulations and aggregate finishing distribution.
"""

import numpy as np
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed


class MonteCarloEngine:
    def __init__(self, simulator):
        self.sim = simulator

    def run(self, initial_state: dict, strategy: dict | None = None, n_simulations: int = 500) -> dict:
        positions = []
        n = max(1, int(n_simulations))
        workers = min(4, n)

        def _one(i: int):
            return self.sim.simulate(initial_state, strategy, seed=i)

        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {executor.submit(_one, i): i for i in range(n)}
            for future in as_completed(futures):
                try:
                    result = future.result(timeout=30.0)
                    positions.append(int(result.get("final_position", 10)))
                except Exception as e:
                    print(f"[MC] Simulation failed: {e}")

        if not positions:
            p0 = int(initial_state.get("position", 10))
            positions = [p0] * min(n, 3)

        positions = sorted(positions)
        n_eff = len(positions)
        counts = Counter(positions)
        distribution = {f"P{p}": counts.get(p, 0) / n_eff for p in range(1, 21)}
        return {
            "finishing_distribution": distribution,
            "median_finish": int(np.median(positions)),
            "p10_finish": positions[int(0.1 * n_eff)] if n_eff else 0,
            "p90_finish": positions[int(0.9 * n_eff)] if n_eff else 0,
            "mean_finish": float(np.mean(positions)),
            "simulation_count": n_eff,
        }

    def compare_strategies(self, initial_state: dict, strategies: list[dict], n_simulations: int = 200) -> list[dict]:
        results = []
        for strategy in strategies:
            mc_result = self.run(initial_state, strategy, n_simulations)
            results.append({
                **strategy,
                "expected_finish": mc_result["mean_finish"],
                "median_finish": mc_result["median_finish"],
                "distribution": mc_result["finishing_distribution"],
            })
        return sorted(results, key=lambda x: x["expected_finish"])
