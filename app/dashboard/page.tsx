'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VoiceAgentConfig as VoiceAgentConfigType } from '@/lib/database/types';
import { Project as DatabaseProject } from '@/lib/database/types';
import { useDatabase } from '@/hooks/useDatabase';
import UserProfile from '@/components/auth/UserProfile';

interface Project {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  last_accessed_at?: string;
  initial_prompt?: string;
  config?: {
    personality?: string;
    language?: string;
    responseStyle?: string;
    capabilities?: string[];
  };
}

// Audio bars visualization component
function AudioBars() {
  return (
    <div className="flex items-end justify-center space-x-1 mt-8 mb-12 h-12">
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          className="bg-white/60 rounded-full"
          style={{ width: '4px' }}
          animate={{
            height: [8, 24, 12, 32, 16, 28, 8, 20, 36, 14, 26, 18],
            opacity: [0.4, 1, 0.6, 1, 0.8, 1, 0.5, 0.9, 1, 0.7, 1, 0.8]
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            delay: i * 0.2,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
}

// Typewriter effect component
function TypewriterEffect() {
  const [currentRoleIndex, setCurrentRoleIndex] = useState(0);
  const [currentText, setCurrentText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  
  const roles = [
    'Teacher',
    'Sales Rep', 
    'Prank Caller',
    'Therapist',
    'Assistant',
    'Tutor',
    'Receptionist',
    'Coach'
  ];
  
  useEffect(() => {
    const currentRole = roles[currentRoleIndex];
    const fullText = `Your Next ${currentRole}`;
    
    const timer = setTimeout(() => {
      if (!isDeleting) {
        // Typing
        if (currentText.length < fullText.length) {
          setCurrentText(fullText.slice(0, currentText.length + 1));
        } else {
          // Pause before deleting
          setTimeout(() => setIsDeleting(true), 2000);
        }
      } else {
        // Deleting
        if (currentText.length > 10) { // Keep "Your Next "
          setCurrentText(currentText.slice(0, -1));
        } else {
          setIsDeleting(false);
          setCurrentRoleIndex((prev) => (prev + 1) % roles.length);
        }
      }
    }, isDeleting ? 50 : 100);
    
    return () => clearTimeout(timer);
  }, [currentText, isDeleting, currentRoleIndex, roles]);
  
  return (
    <span>
      {currentText}
      <span className="animate-pulse">|</span>
    </span>
  );
}

// Loading page component with animated logo and tips
function LoadingPage() {
  const [currentTip, setCurrentTip] = useState(0);
  
  const tips = [
    "💡 Tip: Be specific in your voice agent description for better results",
    "🎯 Tip: You can customize personality, language, and response style",
    "🔊 Tip: Test your agent with different conversation scenarios",
    "⚡ Tip: Use example prompts to get started quickly",
    "🤖 Tip: Your agent will remember context throughout conversations",
    "📝 Tip: Generated code includes all necessary dependencies",
    "🎨 Tip: Agents can handle multiple languages and accents",
    "🔧 Tip: You can modify the generated code after creation"
  ];

  // Rotate tips every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTip((prev) => (prev + 1) % tips.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [tips.length]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col items-center justify-center bg-black"
      style={{ 
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      }}
    >
      <div className="text-center">
        {/* Animated VoiceBun Logo */}
        <motion.div
          animate={{ 
            x: [-20, 20, -20],
          }}
          transition={{ 
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="mb-8"
        >
          <img 
            src="/VoiceBun-BunOnly.png" 
            alt="VoiceBun" 
            className="h-24 w-auto mx-auto"
          />
        </motion.div>

        {/* Loading Dots */}
        <div className="flex justify-center space-x-2 mb-8">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 1, 0.5]
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.2
              }}
              className="w-3 h-3 bg-white rounded-full"
            />
          ))}
        </div>

        {/* Rotating Tips */}
        <motion.div
          key={currentTip}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.5 }}
          className="max-w-md mx-auto"
        >
          <p className="text-white/90 text-lg leading-relaxed">
            {tips[currentTip]}
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}

// Component that uses useSearchParams and needs to be wrapped in Suspense
function DashboardContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isGenerating, setIsGenerating] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { getUserProjects, createProject, createProjectData } = useDatabase();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  // Check for prompt from URL params (from landing page redirect)
  useEffect(() => {
    const urlPrompt = searchParams.get('prompt');
    if (urlPrompt) {
      setPrompt(decodeURIComponent(urlPrompt));
    }
  }, [searchParams]);

  // Redirect unauthenticated users to landing
  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  // Load user projects on component mount
  useEffect(() => {
    if (!user) return;
    
    const loadProjects = async () => {
      try {
        const userProjects = await getUserProjects();
        const projectsData = userProjects.map((project: DatabaseProject) => ({
          ...project,
          description: project.description || undefined
        }));
        setProjects(projectsData);
      } catch (error) {
        console.error('Failed to load projects:', error);
      } finally {
        setLoadingProjects(false);
      }
    };

    loadProjects();
  }, [getUserProjects, user]);

  const generateAgent = useCallback(async () => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    setError(null);
    
    try {
      console.log('🤖 Generating system prompt with ChatGPT 4o...');
      
      // Call the FastAPI backend directly to generate a detailed system prompt
      let generatedSystemPrompt = prompt.trim();
      let systemPromptGenerated = false;
      
      try {
        const backendUrl = process.env.NEXT_PUBLIC_SYSTEM_PROMPT_BACKEND_URL || 'http://localhost:8001';
        const response = await fetch(`${backendUrl}/generate-system-prompt`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_prompt: prompt.trim(),
            context: 'Voice agent assistant',
            tone: 'professional',
            domain: 'general'
          }),
        });

        if (response.ok) {
          const result = await response.json();
          generatedSystemPrompt = result.system_prompt;
          systemPromptGenerated = true;
          console.log('✅ Generated system prompt with ChatGPT 4o:', result.metadata);
        } else {
          console.warn('❌ Backend service error:', response.status, response.statusText);
          console.log('📝 Using enhanced fallback system prompt');
        }
      } catch (apiError) {
        console.warn('❌ Backend service unavailable:', apiError instanceof Error ? apiError.message : String(apiError));
        console.log('📝 Using enhanced fallback system prompt');
      }
      
      // Enhanced fallback if backend is unavailable
      if (!systemPromptGenerated) {
        generatedSystemPrompt = `You are a helpful AI voice assistant designed to ${prompt.trim().toLowerCase()}. 

Your key responsibilities include:
- Providing clear, accurate, and helpful responses to user questions
- Maintaining a professional yet friendly conversational tone
- Asking clarifying questions when you need more information
- Keeping responses concise and appropriate for voice interaction
- Being patient and understanding with users of all backgrounds

Guidelines for conversations:
- Always greet users warmly when they first connect
- Listen carefully to what users are asking for
- Provide specific, actionable information when possible
- If you're unsure about something, be honest and offer alternative ways to help
- End conversations gracefully when users indicate they're finished

Remember to keep your responses natural and conversational since this is a voice-based interaction. Avoid overly long responses and break up complex information into digestible pieces.`;
      }

      // Create a basic configuration from the prompt
      const config: VoiceAgentConfigType = {
        prompt: prompt.trim(),
        personality: "friendly",
        capabilities: [],
        language: "english",
        responseStyle: "conversational"
      };

      // Generate a basic code template using the generated system prompt
      const basicCode = `from dotenv import load_dotenv

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
        super().__init__(instructions="""${generatedSystemPrompt.replace(/"/g, '\\"')}""")

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
        instructions="Hello! How can I help you today?"
    )

if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))`;

      // Create project in database with unique name
      const timestamp = new Date().toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
      const promptPreview = config.prompt.substring(0, 40);
      const projectName = `${promptPreview}${config.prompt.length > 40 ? '...' : ''} (${timestamp})`;
      const projectDescription = `AI voice agent: ${config.prompt.substring(0, 100)}${config.prompt.length > 100 ? '...' : ''}`;
      
      const project = await createProject(
        projectName,
        projectDescription,
        config.prompt,
        config,
        basicCode
      );
      
      console.log('✅ Created project in database:', project.id);
      
      // Create initial project_data entry with the generated system prompt
      const initialProjectData = {
        system_prompt: generatedSystemPrompt,
        agent_instructions: '',
        first_message_mode: 'wait' as const,
        llm_provider: 'openai' as const,
        llm_model: 'gpt-4o-mini',
        llm_temperature: 0.7,
        llm_max_response_length: 300 as const,
        stt_provider: 'deepgram' as const,
        stt_language: 'en' as const,
        stt_quality: 'enhanced' as const,
        stt_processing_mode: 'streaming' as const,
        stt_noise_suppression: true,
        stt_auto_punctuation: true,
        tts_provider: 'cartesia' as const,
        tts_voice: 'neutral' as const,
        phone_number: null,
        phone_inbound_enabled: true,
        phone_outbound_enabled: false,
        phone_recording_enabled: true,
        response_latency_priority: 'balanced' as const,
        knowledge_base_files: [],
        functions_enabled: false,
        custom_functions: [],
        webhooks_enabled: false,
        webhook_url: null,
        webhook_events: []
      };
      
      await createProjectData(project.id, initialProjectData);
      console.log('✅ Created initial project configuration in database');
      
      // Small delay to ensure database operations are complete before navigation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Navigate to the project page
      router.push(`/projects/${project.id}`);
      
    } catch (error) {
      console.error('Error generating agent:', error);
      setError('Failed to generate voice agent. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, createProject, createProjectData, router]);

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

  // Auto-trigger generation if we have a prompt from URL
  useEffect(() => {
    const urlPrompt = searchParams.get('prompt');
    if (urlPrompt && !isGenerating && user) {
      generateAgent();
    }
  }, [searchParams, user, isGenerating, generateAgent]);

  if (loading || (user && loadingProjects) || isGenerating) {
    return <LoadingPage />;
  }

  if (!user) {
    return null; // Will redirect
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-black"
      style={{ 
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' 
      }}
    >
      {/* Header */}
      <header className="">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <img 
              src="/VoiceBun-White.png" 
              alt="VoiceBun" 
              className="h-10 w-auto cursor-pointer"
              onClick={() => router.push('/dashboard')}
            />
          </div>
          <div className="flex items-center space-x-4">
            <a
              href="/projects"
              className="text-white/70 hover:text-white transition-colors"
            >
              Projects
            </a>
            <UserProfile />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6"
            style={{ fontFamily: 'Sniglet, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}
          >
            <TypewriterEffect />
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-white/80 mb-12 max-w-3xl mx-auto"
          >
            Create and share voice agents by chatting with AI
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="relative max-w-4xl mx-auto mb-8"
          >
            <div className="bg-white rounded-3xl p-4 shadow-2xl shadow-white/10">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Describe the voice agent you want to create..."
                    className="w-full h-16 p-4 bg-transparent text-black placeholder-gray-500 focus:outline-none resize-none text-lg text-left"
                    disabled={isGenerating}
                  />
                </div>
                
                <button
                  onClick={generateAgent}
                  disabled={!prompt.trim() || isGenerating}
                  className="w-10 h-10 bg-black hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-all duration-200"
                >
                  {isGenerating ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
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
            <div className="flex flex-wrap justify-center gap-3">
              {examplePrompts.map((example, index) => (
                <button
                  key={index}
                  onClick={() => setPrompt(example)}
                  className="bg-white rounded-lg px-4 py-2 hover:bg-gray-100 transition-colors cursor-pointer text-black hover:text-gray-800 text-sm"
                  disabled={isGenerating}
                >
                  {example}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Audio Bars */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
          >
            <AudioBars />
          </motion.div>
        </div>
      </section>

      {/* Recent Projects Section */}
      {projects.length > 0 && (
        <section className="bg-white">
          <div className="max-w-7xl mx-auto px-6 py-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-black">Your Projects</h2>
                <button 
                  onClick={() => router.push('/projects')}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  View All
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.slice(0, 6).map((project, index) => (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 + index * 0.1 }}
                    className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 hover:shadow-lg transition-all duration-200 cursor-pointer group"
                    onClick={() => router.push(`/projects/${project.id}`)}
                  >
                    <div className="aspect-video bg-gradient-to-br from-blue-500 to-purple-600 relative">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-4xl">🤖</div>
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className="text-black font-medium text-sm group-hover:text-blue-600 transition-colors mb-1">
                        {project.name}
                      </h3>
                      <p className="text-gray-500 text-xs">
                        Created {new Date(project.created_at).toLocaleDateString()} at {new Date(project.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>
      )}
    </motion.div>
  );
} 

// Main page component that wraps DashboardContent with Suspense
export default function DashboardPage() {
  return (
    <Suspense fallback={<LoadingPage />}>
      <DashboardContent />
    </Suspense>
  );
} 