import json
import logging
import sys
import traceback
import asyncio
from types import ModuleType
from dotenv import load_dotenv

from livekit import agents, rtc
from livekit.agents import AgentSession, Agent, RoomInputOptions
from livekit.plugins import (
    openai,
    cartesia,
    deepgram,
    noise_cancellation,
    silero,
)
from livekit.plugins.turn_detector.multilingual import MultilingualModel

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DynamicAssistant(Agent):
    def __init__(self, config: dict = None, generated_code: str = None) -> None:
        """Initialize the assistant with configuration and generated code from the frontend."""
        self.config = config or {}
        self.generated_code = generated_code
        self.custom_assistant = None
        
        # Try to execute generated code if provided
        if self.generated_code:
            try:
                self.custom_assistant = self._execute_generated_code()
                if self.custom_assistant:
                    # If we successfully created a custom assistant, use its instructions
                    super().__init__(instructions=getattr(self.custom_assistant, 'instructions', self._build_instructions()))
                    logger.info("Successfully loaded custom assistant from generated code")
                else:
                    # Fallback to configuration-based instructions
                    super().__init__(instructions=self._build_instructions())
                    logger.info("Using configuration-based assistant")
            except Exception as e:
                logger.error(f"Failed to execute generated code: {e}")
                # Fallback to configuration-based instructions
                super().__init__(instructions=self._build_instructions())
        else:
            # Build instructions based on configuration
            instructions = self._build_instructions()
            super().__init__(instructions=instructions)
        
        logger.info(f"Assistant initialized with config: {self.config}")

    def _execute_generated_code(self):
        """Safely execute the generated code and return the custom assistant if successful."""
        try:
            # Create a controlled execution environment
            exec_globals = {
                '__name__': '__main__',
                '__builtins__': __builtins__,
                # Import necessary modules into the execution environment
                'agents': agents,
                'Agent': Agent,
                'AgentSession': AgentSession,
                'RoomInputOptions': RoomInputOptions,
                'openai': openai,
                'cartesia': cartesia,
                'deepgram': deepgram,
                'noise_cancellation': noise_cancellation,
                'silero': silero,
                'MultilingualModel': MultilingualModel,
                'json': json,
                'logging': logging,
                'load_dotenv': load_dotenv,
                'rtc': rtc,
            }
            exec_locals = {}
            
            # Execute the generated code
            exec(self.generated_code, exec_globals, exec_locals)
            
            # Look for an Assistant class or agent configuration in the executed code
            custom_assistant_class = None
            for name, obj in exec_locals.items():
                if isinstance(obj, type) and issubclass(obj, Agent) and obj != Agent:
                    custom_assistant_class = obj
                    break
            
            if custom_assistant_class:
                # Instantiate the custom assistant with our config
                return custom_assistant_class(self.config) if 'config' in custom_assistant_class.__init__.__code__.co_varnames else custom_assistant_class()
            
            # If no custom Agent class found, look for functions that might configure the agent
            if 'get_instructions' in exec_locals:
                # If there's a get_instructions function, use it
                instructions = exec_locals['get_instructions'](self.config)
                # Create a simple assistant with those instructions
                class GeneratedAssistant(Agent):
                    def __init__(self):
                        super().__init__(instructions=instructions)
                return GeneratedAssistant()
            
            return None
            
        except Exception as e:
            logger.error(f"Error executing generated code: {e}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            return None

    def _build_instructions(self) -> str:
        """Build the instruction prompt based on the configuration (fallback method)."""
        base_instructions = "You are a helpful voice AI assistant."
        
        if not self.config:
            return base_instructions
        
        # Get configuration values
        prompt = self.config.get('prompt', '')
        personality = self.config.get('personality', 'friendly')
        capabilities = self.config.get('capabilities', [])
        language = self.config.get('language', 'english')
        response_style = self.config.get('responseStyle', 'conversational')
        
        # Build comprehensive instructions
        instructions_parts = []
        
        if prompt:
            instructions_parts.append(f"Core Instructions: {prompt}")
        
        # Personality instructions
        personality_map = {
            'friendly': "Be warm, approachable, and encouraging in your responses.",
            'professional': "Maintain a formal, business-like tone and be precise in your communication.",
            'casual': "Use a relaxed, informal tone as if talking to a friend.",
            'witty': "Be clever and humorous, using appropriate jokes and wordplay.",
            'empathetic': "Show understanding and emotional support, be compassionate and caring."
        }
        
        if personality in personality_map:
            instructions_parts.append(f"Personality: {personality_map[personality]}")
        
        # Capabilities instructions
        if capabilities:
            capabilities_text = ", ".join(capabilities)
            instructions_parts.append(f"Your main capabilities include: {capabilities_text}")
        
        # Response style instructions
        style_map = {
            'conversational': "Use natural, flowing conversation style.",
            'concise': "Keep responses brief and to the point.",
            'detailed': "Provide thorough, comprehensive explanations.",
            'creative': "Be imaginative and expressive in your responses."
        }
        
        if response_style in style_map:
            instructions_parts.append(f"Response Style: {style_map[response_style]}")
        
        # Language instructions
        if language != 'english':
            instructions_parts.append(f"Respond primarily in {language.title()}.")
        
        # Combine all instructions
        full_instructions = " ".join(instructions_parts) if instructions_parts else base_instructions
        
        return full_instructions


def get_stt_model(config: dict):
    """Get the appropriate STT model based on configuration."""
    language = config.get('language', 'english')
    
    # Map frontend language options to Deepgram language codes
    language_map = {
        'english': 'en',
        'spanish': 'es',
        'french': 'fr',
        'german': 'de',
        'chinese': 'zh',
        'japanese': 'ja'
    }
    
    deepgram_language = language_map.get(language, 'multi')
    
    return deepgram.STT(
        model="nova-3", 
        language=deepgram_language if deepgram_language != 'multi' else "multi"
    )


def get_llm_model(config: dict):
    """Get the appropriate LLM model based on configuration."""
    return openai.LLM(model="gpt-4o-mini")


def get_tts_model(config: dict):
    """Get the appropriate TTS model based on configuration."""
    return cartesia.TTS()


async def entrypoint(ctx: agents.JobContext):
    """Main entrypoint that handles agent configuration and initialization."""
    
    # Initialize variables for configuration and generated code
    config = {}
    generated_code = None
    session = None
    assistant = None
    
    # Add debug logging for room information
    logger.info(f"Room name: {ctx.room.name}")
    logger.info(f"Room metadata: {ctx.room.metadata}")
    
    async def handle_config_update(new_config, new_generated_code):
        """Handle configuration updates and reinitialize if needed."""
        nonlocal config, generated_code, session, assistant
        
        logger.info(f"🎯 Processing configuration update...")
        config.update(new_config)
        generated_code = new_generated_code
        
        logger.info(f"🎯 Updated config: {config}")
        logger.info(f"🎯 Generated code length: {len(generated_code) if generated_code else 0}")
        
        # If we already have a running session, we could reinitialize it here
        # For now, we'll just update the configuration for future use
        if session and assistant:
            logger.info("🔄 Session already running, configuration updated for next interaction")
        else:
            logger.info("✅ Configuration set, will be used when session starts")
    
    # Set up event listeners BEFORE connecting to ensure we don't miss early messages
    logger.info("🔍 Setting up room event listeners BEFORE connecting...")
    
    # Add participant event listeners
    @ctx.room.on("participant_connected")
    def on_participant_connected(participant):
        logger.info(f"👥 Participant connected: {participant.identity}")
    
    @ctx.room.on("participant_disconnected") 
    def on_participant_disconnected(participant):
        logger.info(f"👥 Participant disconnected: {participant.identity}")
    
    # Listen for data messages containing configuration and code
    @ctx.room.on("data_received")
    def on_data_received(data: rtc.DataPacket):
        logger.info(f"🎯 DATA RECEIVED! From participant: {data.participant.identity if data.participant else 'unknown'}")
        logger.info(f"🎯 Data size: {len(data.data)} bytes")
        logger.info(f"🎯 Participant SID: {data.participant.sid if data.participant else 'unknown'}")
        try:
            decoded_data = data.data.decode()
            logger.info(f"🎯 Raw data (first 500 chars): {decoded_data[:500]}")
            message = json.loads(decoded_data)
            logger.info(f"🎯 Parsed message type: '{message.get('type')}'")
            logger.info(f"🎯 Full message structure: {list(message.keys())}")
            
            if message.get('type') == 'agent_setup':
                new_config = message.get('config', {})
                new_generated_code = message.get('generatedCode')
                
                logger.info(f"🎯 Received agent setup!")
                logger.info(f"🎯 Config keys: {list(new_config.keys()) if new_config else 'None'}")
                logger.info(f"🎯 Has generated code: {new_generated_code is not None}")
                if new_generated_code:
                    logger.info(f"🎯 Generated code length: {len(new_generated_code)}")
                    logger.info(f"🎯 Generated code preview: {new_generated_code[:200]}...")
                
                # Use asyncio to handle the async function
                asyncio.create_task(handle_config_update(new_config, new_generated_code))
            else:
                logger.info(f"🎯 Unknown message type: '{message.get('type')}'")
                
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            logger.error(f"🎯 Failed to parse data message: {e}")
            logger.error(f"🎯 Raw bytes: {data.data}")
    
    # Connect to the room AFTER setting up listeners
    logger.info("🔌 Connecting to room...")
    await ctx.connect()
    logger.info("✅ Connected to room successfully")
    
    # Wait longer for data messages and log periodically
    logger.info("⏳ Waiting for configuration data (up to 15 seconds)...")
    
    for i in range(15):
        await asyncio.sleep(1)
        if config:  # If we received config, break early
            logger.info(f"✅ Configuration received after {i+1} seconds!")
            break
        if (i + 1) % 3 == 0:  # Log every 3 seconds
            logger.info(f"⏳ Still waiting for configuration... ({i+1}/15 seconds)")
    
    if not config:
        logger.warning("⚠️ No configuration received after 15 seconds, using default settings")
    
    # Log final config before initializing models
    logger.info(f"🚀 Starting agent with final config: {config}")
    logger.info(f"Has generated code: {generated_code is not None}")
    
    # Initialize session with configuration-based models AFTER connecting
    session = AgentSession(
        stt=get_stt_model(config),
        llm=get_llm_model(config),
        tts=get_tts_model(config),
        vad=silero.VAD.load(),
        turn_detection=MultilingualModel(),
    )

    # Create assistant with configuration and generated code
    assistant = DynamicAssistant(config, generated_code)

    # Start the session AFTER connecting to the room
    await session.start(
        room=ctx.room,
        agent=assistant,
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVC(), 
        ),
    )

    # Generate personalized greeting based on configuration
    greeting = get_personalized_greeting(config)
    await session.generate_reply(instructions=greeting)
    
    logger.info("🎯 Agent fully initialized and ready. Will continue listening for configuration updates.")


def get_personalized_greeting(config: dict) -> str:
    """Generate a personalized greeting based on the agent configuration."""
    personality = config.get('personality', 'friendly')
    capabilities = config.get('capabilities', [])
    
    greetings = {
        'friendly': "Hello! I'm your friendly AI assistant. How can I help you today?",
        'professional': "Good day. I am your AI assistant, ready to provide professional assistance.",
        'casual': "Hey there! What's up? How can I help you out?",
        'witty': "Well hello there! Your charming AI assistant is here and ready to dazzle you with assistance!",
        'empathetic': "Hello, and welcome! I'm here to listen and help you with whatever you need."
    }
    
    base_greeting = greetings.get(personality, greetings['friendly'])
    
    if capabilities:
        if len(capabilities) <= 3:
            caps_text = ", ".join(capabilities)
            greeting_with_caps = f"{base_greeting} I can help you with {caps_text}."
        else:
            greeting_with_caps = f"{base_greeting} I have various capabilities to assist you with different tasks."
        return greeting_with_caps
    
    return base_greeting


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint)) 