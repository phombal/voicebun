"""
Configuration settings for the voice agent.
"""

# Agent Configuration
AGENT_CONFIG = {
    "prompt": "A language tutor that helps practice conversational Spanish",
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
