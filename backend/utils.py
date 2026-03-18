"""Utilities for JSON-serialisable outputs."""

import numpy as np


def to_python_native(obj):
    """
    Recursively convert numpy/torch types to Python native types
    so they can be JSON serialised by FastAPI.
    """
    if isinstance(obj, dict):
        return {k: to_python_native(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [to_python_native(v) for v in obj]
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    try:
        import torch
        if isinstance(obj, torch.Tensor):
            return obj.item() if obj.numel() == 1 else obj.tolist()
    except ImportError:
        pass
    return obj
