def format_agent_response(text: str) -> str:
    """Format agent response text for better readability."""
    # Remove extra whitespace
    text = ' '.join(text.split())
    
    # Ensure proper sentence endings
    if text and not text.endswith(('.', '!', '?')):
        text += '.'
    
    return text

def validate_config(config: dict) -> bool:
    """Validate agent configuration."""
    required_fields = ['prompt', 'personality', 'language']
    
    for field in required_fields:
        if field not in config or not config[field]:
            return False
    
    return True