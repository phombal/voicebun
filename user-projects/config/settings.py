"""
Configuration settings for the voice agent.
"""

# Agent Configuration
AGENT_CONFIG = {
    "prompt": "A meeting assistant that takes notes and schedules follow-ups",
    "personality": "friendly",
    "language": "english",
    "response_style": "conversational",
    "capabilities": []
}

# Model Configuration
STT_MODEL = "nova-3"
LLM_MODEL = "gpt-4o-mini"
TTS_MODEL = "cartesia"
VAD_MODEL = "silero"
