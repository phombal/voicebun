"use client";

import { CloseIcon } from "@/components/CloseIcon";
import { NoAgentNotification } from "@/components/NoAgentNotification";
import TranscriptionView from "@/components/TranscriptionView";
import { VoiceAgentConfig, type VoiceAgentConfig as VoiceAgentConfigType } from "@/components/VoiceAgentConfig";
import { GeneratedCodeDisplay } from "@/components/GeneratedCodeDisplay";
import {
  BarVisualizer,
  DisconnectButton,
  RoomAudioRenderer,
  RoomContext,
  VideoTrack,
  VoiceAssistantControlBar,
  useVoiceAssistant,
} from "@livekit/components-react";
import { AnimatePresence, motion } from "framer-motion";
import { Room, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useState } from "react";
import type { ConnectionDetails } from "./api/connection-details/route";

type AppState = "landing" | "code-display" | "conversation";

export default function Page() {
  const [room] = useState(new Room());
  const [appState, setAppState] = useState<AppState>("landing");
  const [agentConfig, setAgentConfig] = useState<VoiceAgentConfigType | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string>("");

  const onConnectButtonClicked = useCallback(async () => {
    // Generate room connection details, including:
    //   - A random Room name
    //   - A random Participant name
    //   - An Access Token to permit the participant to join the room
    //   - The URL of the LiveKit server to connect to
    //
    // In real-world application, you would likely allow the user to specify their
    // own participant name, and possibly to choose from existing rooms to join.

    const url = new URL(
      process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? "/api/connection-details",
      window.location.origin
    );
    
    const response = await fetch(url.toString());
    const connectionDetailsData: ConnectionDetails = await response.json();

    console.log('🔌 Connecting to room:', connectionDetailsData.roomName);
    await room.connect(connectionDetailsData.serverUrl, connectionDetailsData.participantToken);
    await room.localParticipant.setMicrophoneEnabled(true);
    
    console.log('✅ Connected to room successfully');
    console.log('👥 Current participants:', room.remoteParticipants.size);
    
    // Wait for the room to be fully established and for any agents to join
    console.log('⏳ Waiting for room to stabilize...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('👥 Participants after wait:', room.remoteParticipants.size);
    
    // Send configuration as data message immediately after connecting
    if (agentConfig && generatedCode) {
      const configMessage = {
        type: 'agent_setup',
        config: agentConfig,
        generatedCode: generatedCode
      };
      
      console.log('📤 Preparing to send agent configuration:', {
        configKeys: Object.keys(agentConfig),
        codeLength: generatedCode.length,
        participantCount: room.remoteParticipants.size
      });
      
      // Send as data message to the room
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(configMessage));
      
      try {
        // Send multiple times with delays to ensure delivery
        for (let attempt = 1; attempt <= 3; attempt++) {
          await room.localParticipant.publishData(data, { reliable: true });
          console.log(`📤 Sent agent configuration (attempt ${attempt}):`, { 
            messageSize: data.length,
            timestamp: new Date().toISOString()
          });
          
          // Wait between attempts
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
      } catch (error) {
        console.error('❌ Failed to send agent configuration:', error);
      }
    }
    
    setAppState("conversation");
  }, [room, agentConfig, generatedCode]);

  const handleAgentGenerated = async (config: VoiceAgentConfigType, code: string) => {
    setAgentConfig(config);
    setGeneratedCode(code);
    
    // Save the generated code to the file system
    try {
      // Create the main voice_agent.py file
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: 'voice_agent.py',
          content: code,
          type: 'file'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save voice_agent.py');
      }

      // Create requirements.txt
      const requirementsContent = `livekit-agents
livekit-plugins-openai
livekit-plugins-deepgram
livekit-plugins-cartesia
livekit-plugins-silero
python-dotenv`;

      await fetch('/api/files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: 'requirements.txt',
          content: requirementsContent,
          type: 'file'
        }),
      });

      // Create .env.example
      const envExampleContent = `# LiveKit Configuration
LIVEKIT_URL=wss://your-livekit-server.com
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret

# AI Service API Keys
OPENAI_API_KEY=your-openai-api-key
DEEPGRAM_API_KEY=your-deepgram-api-key
CARTESIA_API_KEY=your-cartesia-api-key`;

      await fetch('/api/files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: '.env.example',
          content: envExampleContent,
          type: 'file'
        }),
      });

      // Create README.md
      const readmeContent = `# Voice Agent

This is an AI-powered voice agent built with LiveKit.

## Setup

1. Install dependencies:
   \`\`\`bash
   pip install -r requirements.txt
   \`\`\`

2. Copy \`.env.example\` to \`.env\` and fill in your API keys:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

3. Run the agent:
   \`\`\`bash
   python voice_agent.py
   \`\`\`

## Configuration

- **Prompt**: ${config.prompt}
- **Personality**: ${config.personality}
- **Language**: ${config.language}
- **Response Style**: ${config.responseStyle}
- **Capabilities**: ${config.capabilities.join(', ') || 'None specified'}

## Agent Description

${config.prompt}
`;

      await fetch('/api/files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: 'README.md',
          content: readmeContent,
          type: 'file'
        }),
      });

      // Create config directory and settings.py
      await fetch('/api/files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: 'config',
          type: 'folder'
        }),
      });

      const settingsContent = `"""
Configuration settings for the voice agent.
"""

# Agent Configuration
AGENT_CONFIG = {
    "prompt": "${config.prompt.replace(/"/g, '\\"')}",
    "personality": "${config.personality}",
    "language": "${config.language}",
    "response_style": "${config.responseStyle}",
    "capabilities": ${JSON.stringify(config.capabilities)}
}

# Model Configuration
STT_MODEL = "nova-3"
LLM_MODEL = "gpt-4o-mini"
TTS_MODEL = "cartesia"
VAD_MODEL = "silero"
`;

      await fetch('/api/files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: 'config/settings.py',
          content: settingsContent,
          type: 'file'
        }),
      });

      // Create utils directory and files
      await fetch('/api/files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: 'utils',
          type: 'folder'
        }),
      });

      const loggerContent = `"""
Logging utilities for the voice agent.
"""

import logging
import sys
from datetime import datetime

def setup_logger(name: str = "voice_agent", level: int = logging.INFO) -> logging.Logger:
    """Set up a logger with console and file handlers."""
    logger = logging.getLogger(name)
    logger.setLevel(level)
    
    # Avoid adding multiple handlers if logger already exists
    if logger.handlers:
        return logger
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    
    # File handler
    file_handler = logging.FileHandler(f"logs/{name}_{datetime.now().strftime('%Y%m%d')}.log")
    file_handler.setLevel(level)
    
    # Formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    console_handler.setFormatter(formatter)
    file_handler.setFormatter(formatter)
    
    logger.addHandler(console_handler)
    logger.addHandler(file_handler)
    
    return logger
`;

      await fetch('/api/files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: 'utils/logger.py',
          content: loggerContent,
          type: 'file'
        }),
      });

      const helpersContent = `"""
Helper utilities for the voice agent.
"""

import os
import json
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

def validate_env_vars() -> bool:
    """Validate that required environment variables are set."""
    required_vars = [
        "LIVEKIT_URL",
        "LIVEKIT_API_KEY", 
        "LIVEKIT_API_SECRET",
        "OPENAI_API_KEY"
    ]
    
    missing_vars = []
    for var in required_vars:
        if not os.getenv(var):
            missing_vars.append(var)
    
    if missing_vars:
        print(f"Missing required environment variables: {', '.join(missing_vars)}")
        return False
    
    return True

def format_response(text: str, max_length: int = 500) -> str:
    """Format and truncate response text if needed."""
    if len(text) <= max_length:
        return text
    
    # Truncate at the last complete sentence within the limit
    truncated = text[:max_length]
    last_period = truncated.rfind('.')
    
    if last_period > max_length * 0.7:  # If we can keep at least 70% of the text
        return truncated[:last_period + 1]
    else:
        return truncated + "..."
`;

      await fetch('/api/files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: 'utils/helpers.py',
          content: helpersContent,
          type: 'file'
        }),
      });

      console.log('✅ Successfully saved generated code and project files to file system');
    } catch (error) {
      console.error('❌ Failed to save generated code to file system:', error);
      // Continue anyway - the code will still be displayed
    }
    
    setAppState("code-display");
  };

  const handleReconfigure = () => {
    setAppState("landing");
    setAgentConfig(null);
    setGeneratedCode("");
  };

  const handleBackToLanding = () => {
    setAppState("landing");
    setAgentConfig(null);
    setGeneratedCode("");
  };

  const handleStartConversation = () => {
    onConnectButtonClicked();
  };

  useEffect(() => {
    room.on(RoomEvent.MediaDevicesError, onDeviceFailure);

    return () => {
      room.off(RoomEvent.MediaDevicesError, onDeviceFailure);
    };
  }, [room]);

  return (
    <main data-lk-theme="default" className="h-full bg-[var(--lk-bg)]">
      <RoomContext.Provider value={room}>
        <div className="h-screen">
          <AnimatePresence mode="wait">
            {appState === "landing" && (
              <LandingPage onAgentGenerated={handleAgentGenerated} />
            )}
            
            {appState === "code-display" && agentConfig && generatedCode && (
              <motion.div
                key="code-display"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, ease: [0.09, 1.04, 0.245, 1.055] }}
                className="h-screen w-full"
              >
                <GeneratedCodeDisplay
                  code={generatedCode}
                  config={agentConfig}
                  onStartConversation={handleStartConversation}
                  onReconfigure={handleReconfigure}
                  onBackToHome={handleBackToLanding}
                />
              </motion.div>
            )}
            
            {appState === "conversation" && (
              <motion.div
                key="conversation"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3, ease: [0.09, 1.04, 0.245, 1.055] }}
                className="h-screen"
              >
                <div className="max-w-[1024px] w-[90vw] mx-auto h-full max-h-[90vh] mt-[5vh]">
                  <SimpleVoiceAssistant onReconfigure={handleReconfigure} onBackToHome={handleBackToLanding} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </RoomContext.Provider>
    </main>
  );
}

function LandingPage({ onAgentGenerated }: { onAgentGenerated: (config: VoiceAgentConfigType, code: string) => void }) {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateAgent = async () => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    setError(null);
    
    try {
      // Create a basic configuration from the prompt
      const config: VoiceAgentConfigType = {
        prompt: prompt.trim(),
        personality: "friendly",
        capabilities: [],
        language: "english",
        responseStyle: "conversational"
      };

      const generatePrompt = `You are an expert Python developer specializing in LiveKit voice agents. Generate ONLY Python code for a complete LiveKit voice agent that matches the user's exact description.

IMPORTANT: The agent must match this description: "${prompt}"

Generate the COMPLETE agent structure with all necessary components:

1. Import statements (dotenv, agents, plugins)
2. load_dotenv() call
3. Custom Agent class extending Agent with appropriate instructions
4. entrypoint function with AgentSession setup
5. Main execution block

Follow this EXACT structure from LiveKit documentation:

\`\`\`python
from dotenv import load_dotenv

from livekit import agents
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

class Assistant(Agent):
    def __init__(self) -> None:
        # CRITICAL: The instructions must match the user's description exactly
        super().__init__(instructions="[CUSTOM INSTRUCTIONS BASED ON USER DESCRIPTION]")

async def entrypoint(ctx: agents.JobContext):
    session = AgentSession(
        stt=deepgram.STT(model="nova-3", language="multi"),
        llm=openai.LLM(model="gpt-4o-mini"),
        tts=cartesia.TTS(),
        vad=silero.VAD.load(),
        turn_detection=MultilingualModel(),
    )

    await session.start(
        room=ctx.room,
        agent=Assistant(),
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVC(), 
        ),
    )

    await ctx.connect()

    await session.generate_reply(
        instructions="[GREETING THAT MATCHES THE AGENT TYPE]"
    )

if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))
\`\`\`

User Description: "${prompt}"

CRITICAL REQUIREMENTS:
1. Replace [CUSTOM INSTRUCTIONS BASED ON USER DESCRIPTION] with detailed instructions that match the user's description exactly
2. Replace [GREETING THAT MATCHES THE AGENT TYPE] with an appropriate greeting for this type of agent
3. If the user wants a prank caller, make it a prank caller with appropriate personality and behavior
4. If the user wants customer service, make it customer service focused
5. The agent's personality and behavior must match the user's description completely
6. Do not generate generic meeting assistant code - generate what the user actually asked for

Generate the complete agent code with proper structure and NO explanatory text:`;

      const response = await fetch('/api/generate-agent-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: generatePrompt,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate code');
      }

      const data = await response.json();
      
      // Clean the generated code by removing any markdown formatting or extra text
      let cleanCode = data.code;
      
      // Remove markdown code blocks if present
      cleanCode = cleanCode.replace(/```python\n?/g, '');
      cleanCode = cleanCode.replace(/```\n?/g, '');
      
      // Remove any leading/trailing whitespace
      cleanCode = cleanCode.trim();
      
      // If the code doesn't start with import or from, try to extract just the code part
      if (!cleanCode.startsWith('import') && !cleanCode.startsWith('from')) {
        // Look for the first line that starts with import or from
        const lines = cleanCode.split('\n');
        const codeStartIndex = lines.findIndex((line: string) => 
          line.trim().startsWith('import') || 
          line.trim().startsWith('from')
        );
        if (codeStartIndex !== -1) {
          cleanCode = lines.slice(codeStartIndex).join('\n');
        }
      }
      
      onAgentGenerated(config, cleanCode);
    } catch (error) {
      console.error('Error generating agent:', error);
      setError('Failed to generate voice agent. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      generateAgent();
    }
  };

  const examplePrompts = [
    "A customer service representative for an e-commerce company",
    "A language tutor that helps practice conversational Spanish",
    "A meeting assistant that takes notes and schedules follow-ups",
    "A healthcare helper that provides wellness tips and reminders"
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
    >
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-white">VoiceAgentAI</h1>
          </div>
          <nav className="hidden md:flex items-center space-x-8">
            <a href="#features" className="text-gray-300 hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="text-gray-300 hover:text-white transition-colors">How it Works</a>
            <a href="#examples" className="text-gray-300 hover:text-white transition-colors">Examples</a>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-6xl font-bold text-white mb-6"
          >
            Hi there, what do you want to{" "}
            <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              create?
            </span>
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-gray-300 mb-12 max-w-3xl mx-auto"
          >
            Describe your voice agent and watch it come to life with AI-powered conversations.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="relative max-w-3xl mx-auto mb-8"
          >
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-gray-400 text-sm ml-4">Create your voice agent...</span>
              </div>
              
              <div className="relative">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Describe the voice agent you want to create... (e.g., 'A helpful customer service representative for my online store')"
                  className="w-full h-32 p-4 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none resize-none"
                  disabled={isGenerating}
                />
                
                <button
                  onClick={generateAgent}
                  disabled={!prompt.trim() || isGenerating}
                  className="absolute bottom-4 right-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-medium px-6 py-2 rounded-lg transition-all duration-200 flex items-center space-x-2"
                >
                  {isGenerating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <span>Generate Agent</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>

          {/* Error Display */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-3xl mx-auto mb-8 p-4 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-center"
            >
              {error}
            </motion.div>
          )}

          {/* Example Prompts */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mb-12"
          >
            <p className="text-gray-400 mb-4">Try these examples:</p>
            <div className="flex flex-wrap justify-center gap-3">
              {examplePrompts.map((example, index) => (
                <button
                  key={index}
                  onClick={() => setPrompt(example)}
                  className="bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-2 hover:border-gray-600 transition-colors cursor-pointer text-gray-300 hover:text-white text-sm"
                  disabled={isGenerating}
                >
                  {example}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="bg-gray-800/30 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white mb-4">Powerful Features</h2>
            <p className="text-gray-300 text-lg">Everything you need to build intelligent voice agents</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon="🤖"
              title="AI-Powered Generation"
              description="Describe your agent in natural language and watch it come to life with the perfect personality and capabilities."
            />
            <FeatureCard
              icon="🎙️"
              title="Real-time Voice Interaction"
              description="High-quality voice processing with natural speech recognition and text-to-speech powered by leading AI models."
            />
            <FeatureCard
              icon="⚡"
              title="Instant Deployment"
              description="Generate and deploy your voice agent in seconds. No complex setup or infrastructure management required."
            />
            <FeatureCard
              icon="🌍"
              title="Multi-language Support"
              description="Create agents that speak multiple languages with native-level fluency and cultural understanding."
            />
            <FeatureCard
              icon="🎨"
              title="Custom Personalities"
              description="Your agent automatically adapts its personality based on your description and use case."
            />
            <FeatureCard
              icon="🔧"
              title="Smart Capabilities"
              description="AI automatically determines the best capabilities for your agent based on your description."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-12">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-gray-400">
            Built with LiveKit, OpenAI, and modern web technologies
          </p>
        </div>
      </footer>
    </motion.div>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 hover:border-gray-600 transition-all duration-200"
    >
      <div className="text-3xl mb-4">{icon}</div>
      <h3 className="text-xl font-semibold text-white mb-3">{title}</h3>
      <p className="text-gray-300">{description}</p>
    </motion.div>
  );
}

function SimpleVoiceAssistant(props: { onReconfigure: () => void; onBackToHome: () => void }) {
  const { state: agentState } = useVoiceAssistant();

  return (
    <div className="flex flex-col items-center gap-4 h-full">
      <AgentVisualizer />
      <div className="flex-1 w-full">
        <TranscriptionView />
      </div>
      <div className="w-full">
        <ControlBar onReconfigure={props.onReconfigure} onBackToHome={props.onBackToHome} />
      </div>
      <RoomAudioRenderer />
      <NoAgentNotification state={agentState} />
    </div>
  );
}

function AgentVisualizer() {
  const { state: agentState, videoTrack, audioTrack } = useVoiceAssistant();

  if (videoTrack) {
    return (
      <div className="h-[512px] w-[512px] rounded-lg overflow-hidden">
        <VideoTrack trackRef={videoTrack} />
      </div>
    );
  }
  return (
    <div className="h-[300px] w-full">
      <BarVisualizer
        state={agentState}
        barCount={5}
        trackRef={audioTrack}
        className="agent-visualizer"
        options={{ minHeight: 24 }}
      />
    </div>
  );
}

function ControlBar(props: { onReconfigure: () => void; onBackToHome: () => void }) {
  const { state: agentState } = useVoiceAssistant();

  return (
    <div className="relative h-[60px]">
      <AnimatePresence>
        {agentState !== "disconnected" && agentState !== "connecting" && (
          <motion.div
            initial={{ opacity: 0, top: "10px" }}
            animate={{ opacity: 1, top: 0 }}
            exit={{ opacity: 0, top: "-10px" }}
            transition={{ duration: 0.4, ease: [0.09, 1.04, 0.245, 1.055] }}
            className="flex h-8 absolute left-1/2 -translate-x-1/2 justify-center items-center space-x-4"
          >
            <VoiceAssistantControlBar controls={{ leave: false }} />
            <DisconnectButton>
              <CloseIcon />
            </DisconnectButton>
            <motion.button
              onClick={props.onReconfigure}
              className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded-md transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              New Agent
            </motion.button>
            <motion.button
              onClick={props.onBackToHome}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Home
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function onDeviceFailure(error: Error) {
  console.error(error);
  alert(
    "Error acquiring camera or microphone permissions. Please make sure you grant the necessary permissions in your browser and reload the tab"
  );
}
