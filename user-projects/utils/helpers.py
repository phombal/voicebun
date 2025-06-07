"""
Helper utilities for the voice agent.
"""

import json
import os
from typing import Dict, Any, Optional

def load_config(config_path: str = "config/settings.py") -> Dict[str, Any]:
    """Load configuration from settings file."""
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location("settings", config_path)
        settings = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(settings)
        return settings.AGENT_CONFIG
    except Exception as e:
        print(f"Error loading config: {e}")
        return {}

def get_env_var(key: str, default: Optional[str] = None) -> str:
    """Get environment variable with optional default."""
    value = os.getenv(key, default)
    if value is None:
        raise ValueError(f"Environment variable {key} is required")
    return value

def format_response(text: str, max_length: int = 500) -> str:
    """Format response text to fit within length limits."""
    if len(text) <= max_length:
        return text
    
    # Try to cut at sentence boundary
    sentences = text.split('. ')
    result = ""
    for sentence in sentences:
        if len(result + sentence + '. ') <= max_length:
            result += sentence + '. '
        else:
            break
    
    return result.strip() or text[:max_length].strip() + "..."
