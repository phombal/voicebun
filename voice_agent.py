#!/usr/bin/env python3

import os
import sys
import json
import asyncio
import logging
import requests
from typing import Dict, Any, Optional
from dataclasses import dataclass
from livekit.agents import AutoSubscribe, JobContext, WorkerOptions, cli, llm
from livekit.agents import AgentSession
from livekit.plugins import openai, deepgram, cartesia, silero
import livekit.plugins.google as google

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class AgentConfiguration:
    """Agent configuration loaded from database"""
    id: str
    name: str
    description: str
    stt: Dict[str, Any]
    tts: Dict[str, Any]
    llm: Dict[str, Any]
    vad: Dict[str, Any]
    instructions: str
    personality: Dict[str, Any]
    turn_detection: Dict[str, Any]
    function_calls: list
    tool_integrations: list
    required_env_vars: list
    dependencies: list
    source_files: Dict[str, str]
    version: int
    created_at: str
    updated_at: str

class AgentConfigLoader:
    """Loads agent configurations from the API"""
    
    def __init__(self, api_base_url: str = "http://localhost:3000"):
        self.api_base_url = api_base_url
    
    def load_config(self, config_id: str) -> Optional[AgentConfiguration]:
        """Load agent configuration by ID"""
        try:
            response = requests.get(f"{self.api_base_url}/api/agent-config/{config_id}")
            response.raise_for_status()
            
            data = response.json()
            config_data = data['config']
            
            return AgentConfiguration(**config_data)
            
        except requests.RequestException as e:
            logger.error(f"Failed to load configuration {config_id}: {e}")
            return None
        except Exception as e:
            logger.error(f"Error parsing configuration {config_id}: {e}")
            return None

class DynamicVoiceAgent:
    """Voice agent that can be configured dynamically from database"""
    
    def __init__(self, config: AgentConfiguration):
        self.config = config
        self._validate_environment()
        
    def _validate_environment(self):
        """Validate that required environment variables are set"""
        missing_vars = []
        for var in self.config.required_env_vars:
            if not os.getenv(var):
                missing_vars.append(var)
        
        if missing_vars:
            raise ValueError(f"Missing required environment variables: {missing_vars}")
    
    def _create_stt(self):
        """Create STT instance based on configuration"""
        provider = self.config.stt['provider']
        model = self.config.stt['model']
        config = self.config.stt['config']
        
        if provider == 'deepgram':
            return deepgram.STT(model=model, **config)
        elif provider == 'openai':
            return openai.STT(model=model, **config)
        elif provider == 'google':
            return google.STT(model=model, **config)
        else:
            raise ValueError(f"Unsupported STT provider: {provider}")
    
    def _create_tts(self):
        """Create TTS instance based on configuration"""
        provider = self.config.tts['provider']
        model = self.config.tts['model']
        config = self.config.tts['config']
        
        if provider == 'cartesia':
            return cartesia.TTS(model=model, **config)
        elif provider == 'openai':
            return openai.TTS(model=model, **config)
        elif provider == 'google':
            return google.TTS(model=model, **config)
        elif provider == 'elevenlabs':
            # Note: You'll need to install livekit-plugins-elevenlabs
            # return elevenlabs.TTS(model=model, **config)
            raise ValueError("ElevenLabs TTS not implemented yet")
        else:
            raise ValueError(f"Unsupported TTS provider: {provider}")
    
    def _create_llm(self):
        """Create LLM instance based on configuration"""
        provider = self.config.llm['provider']
        model = self.config.llm['model']
        config = self.config.llm['config']
        
        if provider == 'openai':
            return openai.LLM(model=model, **config)
        elif provider == 'google':
            return google.LLM(model=model, **config)
        elif provider == 'anthropic':
            # Note: You'll need to install livekit-plugins-anthropic
            # return anthropic.LLM(model=model, **config)
            raise ValueError("Anthropic LLM not implemented yet")
        else:
            raise ValueError(f"Unsupported LLM provider: {provider}")
    
    def _create_vad(self):
        """Create VAD instance based on configuration"""
        provider = self.config.vad['provider']
        config = self.config.vad['config']
        
        if provider == 'silero':
            return silero.VAD(**config)
        else:
            raise ValueError(f"Unsupported VAD provider: {provider}")
    
    def _create_function_calls(self):
        """Create function call handlers from configuration"""
        # This would need to be implemented based on your specific function call format
        # For now, return empty list
        return []

async def entrypoint(ctx: JobContext):
    """Main entrypoint for the voice agent"""
    
    # Get configuration ID from environment or command line
    config_id = os.getenv('AGENT_CONFIG_ID')
    if not config_id and len(sys.argv) > 1:
        config_id = sys.argv[1]
    
    if not config_id:
        logger.error("No configuration ID provided. Set AGENT_CONFIG_ID environment variable or pass as argument.")
        return
    
    # Load configuration
    loader = AgentConfigLoader()
    config = loader.load_config(config_id)
    
    if not config:
        logger.error(f"Failed to load configuration: {config_id}")
        return
    
    logger.info(f"Loaded configuration: {config.name} (v{config.version})")
    
    # Create dynamic agent
    try:
        dynamic_agent = DynamicVoiceAgent(config)
        
        # Create components using the configuration
        stt = dynamic_agent._create_stt()
        tts = dynamic_agent._create_tts()
        llm_instance = dynamic_agent._create_llm()
        vad = dynamic_agent._create_vad()
        
        # Create initial chat context
        initial_ctx = llm.ChatContext().append(
            role="system",
            text=config.instructions
        )
        
        # Connect to room
        await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
        
        # Create agent session with the configured components
        session = AgentSession(
            stt=stt,
            llm=llm_instance,
            tts=tts,
            vad=vad,
            chat_ctx=initial_ctx
        )
        
        # Start the session
        session.start(ctx.room)
        
        logger.info(f"Voice assistant '{config.name}' is ready!")
        
        # Generate initial greeting
        await session.generate_reply(
            instructions=f"Hello! I'm {config.name}. {config.description}"
        )
        
    except Exception as e:
        logger.error(f"Failed to start voice assistant: {e}")
        raise

def main():
    """Main function to run the agent"""
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
        )
    )

if __name__ == "__main__":
    main() 