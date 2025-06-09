"""
Configuration settings for the voice agent.
"""

# Agent Configuration
AGENT_CONFIG = {
    "prompt": "A customer service representative for an e-commerce company",
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
