"use client";

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { motion } from 'framer-motion'
import { VoiceAgentConfig as VoiceAgentConfigType } from '@/lib/database/types'
import { Project as DatabaseProject } from '@/lib/database/types'
import { useDatabase } from '@/hooks/useDatabase'
import PublicNavigation from '@/components/PublicNavigation'
import UserProfile from '@/components/auth/UserProfile'
import { LoadingPageWithTips } from '@/components/LoadingBun'
import CommunityProjectsSection from '@/components/CommunityProjectsSection'
import Image from 'next/image'

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

// Component that uses useSearchParams and needs to be wrapped in Suspense
function HomeContent() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPublic, setIsPublic] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const { getUserProjects, createProject, createProjectData, updateProject } = useDatabase()
  const [projects, setProjects] = useState<Project[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)

  // Scroll effect for navbar
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      setScrolled(scrollPosition > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Check for prompt from URL params (from auth redirect)
  useEffect(() => {
    const urlPrompt = searchParams.get('prompt');
    if (urlPrompt) {
      setPrompt(decodeURIComponent(urlPrompt));
    }
  }, [searchParams]);

  // Load user projects when authenticated
  useEffect(() => {
    if (!user || loading) {
      setLoadingProjects(false)
      return
    }
    
    console.log('📂 Loading projects for user:', user.id);
    setLoadingProjects(true)
    
    // Set timeout fallback to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.log('⏰ Projects loading timeout reached, forcing completion');
      setLoadingProjects(false);
    }, 10000); // 10 second timeout
    
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
        clearTimeout(timeoutId);
        setLoadingProjects(false);
      }
    };

    loadProjects();
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [user?.id, loading, getUserProjects]);

  const generateAgent = useCallback(async () => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    setError(null);
    
    try {
      console.log('🤖 Generating system prompt with ChatGPT 4o...');
      
      // Helper function to generate a better fallback title
      const generateFallbackTitle = (userPrompt: string): string => {
        // Clean up the prompt
        const cleanPrompt = userPrompt.trim();
        
        // Common patterns to create better titles
        if (cleanPrompt.toLowerCase().includes('customer service')) {
          return 'Customer Service Assistant';
        } else if (cleanPrompt.toLowerCase().includes('language') && cleanPrompt.toLowerCase().includes('tutor')) {
          return 'Language Learning Tutor';
        } else if (cleanPrompt.toLowerCase().includes('healthcare') || cleanPrompt.toLowerCase().includes('medical')) {
          return 'Healthcare Assistant';
        } else if (cleanPrompt.toLowerCase().includes('sales') || cleanPrompt.toLowerCase().includes('marketing')) {
          return 'Sales & Marketing Assistant';
        } else if (cleanPrompt.toLowerCase().includes('education') || cleanPrompt.toLowerCase().includes('teacher')) {
          return 'Educational Assistant';
        } else if (cleanPrompt.toLowerCase().includes('personal assistant') || cleanPrompt.toLowerCase().includes('productivity')) {
          return 'Personal Assistant';
        } else if (cleanPrompt.toLowerCase().includes('entertainment') || cleanPrompt.toLowerCase().includes('game')) {
          return 'Entertainment Assistant';
        } else {
          // Create a title from the first few words, capitalizing appropriately
          const words = cleanPrompt.split(' ').slice(0, 4);
          const title = words.map(word => {
            // Skip articles and prepositions for capitalization
            const skipWords = ['a', 'an', 'the', 'for', 'of', 'in', 'on', 'at', 'to', 'with', 'that', 'helps', 'who'];
            if (skipWords.includes(word.toLowerCase())) {
              return word.toLowerCase();
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          }).join(' ');
          
          return title.endsWith('Assistant') ? title : `${title} Assistant`;
        }
      };
      
      // Call the local API to generate a detailed system prompt
      let generatedSystemPrompt = prompt.trim();
      let generatedWelcomeMessage = '';
      let generatedTitle = '';
      let systemPromptGenerated = false;
      
      try {
        // Use local API route instead of external backend
        const response = await fetch('/api/generate-system-prompt', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_prompt: prompt.trim(),
            context: 'Voice agent assistant',
            tone: 'professional',
            domain: 'general',
            generate_title: true // Request title generation
          }),
        });

        console.log('📡 Response status:', response.status);
        console.log('📡 Response ok:', response.ok);

        if (response.ok) {
          const result = await response.json();
          generatedSystemPrompt = result.system_prompt;
          generatedWelcomeMessage = result.welcome_message || '';
          generatedTitle = result.title || '';
          systemPromptGenerated = true;
          console.log('✅ Generated system prompt, welcome message, and title with local API:', result.metadata);
        } else {
          const errorText = await response.text();
          console.warn('❌ Local API error:', response.status, response.statusText);
          console.warn('❌ Error details:', errorText);
          console.log('📝 Using enhanced fallback system prompt and title');
        }
      } catch (apiError) {
        console.warn('❌ Local API unavailable:', apiError instanceof Error ? apiError.message : String(apiError));
        console.warn('❌ Full error:', apiError);
        console.log('📝 Using enhanced fallback system prompt and title');
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
        
        // Generate a fallback welcome message based on the prompt
        generatedWelcomeMessage = `Hello! I'm your ${prompt.trim().toLowerCase()} assistant. How can I help you today?`;
        
        // Generate a better fallback title based on the prompt
        generatedTitle = generateFallbackTitle(prompt.trim());
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

      // Create project in database with better title
      const projectName = generatedTitle || generateFallbackTitle(prompt.trim());
      const projectDescription = `AI voice agent: ${config.prompt.substring(0, 100)}${config.prompt.length > 100 ? '...' : ''}`;
      
      const project = await createProject(
        projectName,
        projectDescription,
        config.prompt,
        config,
        basicCode,
        isPublic ? 'public' : 'private'
      );
      
      console.log('✅ Created project in database:', project.id);
      
      // Auto-tag the project based on its content
      console.log('🏷️ Starting auto-tagging process for new project...');
      let autoTaggedCategory = 'other'; // Default category
      let categoryEmoji = '🤖'; // Default emoji
      
      console.log('🏷️ Initial values - Category:', autoTaggedCategory, 'Emoji:', categoryEmoji);
      
      try {
        console.log('🏷️ Making auto-tag API request with data:', {
          systemPrompt: generatedSystemPrompt.substring(0, 100) + '...',
          title: projectName,
          description: project.description || 'undefined',
          publicDescription: prompt.trim() || 'undefined'
        });
        
        const autoTagResponse = await fetch('/api/auto-tag', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            systemPrompt: generatedSystemPrompt,
            title: projectName,
            description: project.description || undefined,
            publicDescription: prompt.trim() || undefined
          }),
        });

        console.log('🏷️ Auto-tag API response status:', autoTagResponse.status);
        console.log('🏷️ Auto-tag API response ok:', autoTagResponse.ok);

        if (autoTagResponse.ok) {
          const responseData = await autoTagResponse.json();
          console.log('🏷️ Auto-tag API response data:', responseData);
          
          const { category } = responseData;
          console.log('🏷️ Extracted category from response:', category, 'Type:', typeof category);
          
          if (category && category !== 'undefined') {
            autoTaggedCategory = category;
            console.log('✅ Category updated to:', autoTaggedCategory);
          } else {
            console.warn('⚠️ Category from API is empty or undefined, keeping default:', autoTaggedCategory);
          }
          
          // Get the emoji for the auto-tagged category
          const { getCategoryEmoji } = await import('@/lib/auto-tagger');
          categoryEmoji = getCategoryEmoji(autoTaggedCategory as any) || '🤖';
          console.log('🎯 Setting project emoji based on category:', `${autoTaggedCategory} -> ${categoryEmoji}`);
        } else {
          const errorText = await autoTagResponse.text();
          console.warn('⚠️ Auto-tagging failed with status:', autoTagResponse.status);
          console.warn('⚠️ Error response:', errorText);
          console.warn('⚠️ Using default category and emoji');
        }
      } catch (error) {
        console.error('❌ Auto-tagging error:', error);
        console.log('🔄 Continuing with default category:', autoTaggedCategory, 'and emoji:', categoryEmoji);
        // Continue with default category and emoji
      }
      
      console.log('🏷️ Final auto-tagging values - Category:', autoTaggedCategory, 'Emoji:', categoryEmoji);
      
      // Create initial project_data entry with the generated system prompt
      const initialProjectData = {
        system_prompt: generatedSystemPrompt,
        agent_instructions: generatedWelcomeMessage,
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
        webhook_events: [],
        
        // Public visibility settings
        project_emoji: categoryEmoji, // Use the emoji based on the auto-tagged category
        public_title: isPublic ? projectName : null,
        public_description: isPublic ? prompt.trim() : null,
        public_welcome_message: isPublic ? generatedWelcomeMessage : null,
        show_branding: true,
        custom_branding_text: null,
        custom_branding_url: null,
      };
      
      console.log('🚀 About to create project data with the following payload:');
      console.log('🚀 initialProjectData keys:', Object.keys(initialProjectData));
      console.log('🚀 initialProjectData.project_emoji:', initialProjectData.project_emoji);
      console.log('🚀 Full initialProjectData object:', JSON.stringify(initialProjectData, null, 2));
      
      await createProjectData(project.id, initialProjectData);
      console.log('✅ Created initial project configuration in database');
      
      // Now update the project with the category
      console.log('🏷️ Updating project with category:', autoTaggedCategory);
      try {
        await updateProject(project.id, { 
          category: autoTaggedCategory,
          project_emoji: categoryEmoji 
        });
        console.log('✅ Project category and emoji updated successfully');
      } catch (categoryError) {
        console.error('❌ Error updating project category:', categoryError);
        // Don't fail the entire process if category update fails
      }
      
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
  }, [prompt, createProject, createProjectData, router, isPublic, updateProject]);

  const handleSubmit = () => {
    if (!prompt.trim()) return
    
    if (!user) {
      // Show auth prompt - redirect to auth page
      router.push('/auth')
    } else {
      // User is authenticated, generate the agent
      generateAgent()
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const examplePrompts = [
    "A customer service representative for an e-commerce company",
    "A language tutor that helps practice conversational Spanish", 
    "A meeting assistant that takes notes and schedules follow-ups",
    "A healthcare helper that provides wellness tips and reminders"
  ]

  // Auto-trigger generation if we have a prompt from URL and user is authenticated
  useEffect(() => {
    const urlPrompt = searchParams.get('prompt');
    if (urlPrompt && !isGenerating && user) {
      generateAgent();
    }
  }, [searchParams, user, isGenerating, generateAgent]);

  if (loading || isGenerating) {
    return <LoadingPageWithTips />;
  }

  // Render navigation based on auth status
  const renderNavigation = () => {
    if (!user) {
      return <PublicNavigation />
    }

    return (
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled 
          ? 'bg-black/90 backdrop-blur-md shadow-lg' 
          : 'bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Mobile Menu Button - Only visible on mobile */}
            <div className="md:hidden">
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="w-8 h-8 hover:bg-white/10 rounded-lg transition-colors flex items-center justify-center"
                title="Menu"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>

            <Image 
              src="/VoiceBun-White.png" 
              alt="VoiceBun" 
              width={120}
              height={40}
              className="h-10 w-auto cursor-pointer"
              onClick={() => router.push('/')}
            />
          </div>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4">
            <button
              onClick={() => router.push('/projects')}
              className="text-white/70 hover:text-white transition-colors"
            >
              Projects
            </button>
            <button
              onClick={() => router.push('/community')}
              className="text-white/70 hover:text-white transition-colors"
            >
              Community
            </button>
            <UserProfile />
          </div>

          {/* Mobile User Profile */}
          <div className="md:hidden">
            <UserProfile />
          </div>
        </div>

        {/* Mobile Menu Sidebar */}
        {showMobileMenu && (
          <div className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setShowMobileMenu(false)}>
            <div className="absolute top-0 left-0 w-64 h-full bg-neutral-800 border-r border-white/20" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b border-white/20">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">Menu</h3>
                  <button
                    onClick={() => setShowMobileMenu(false)}
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                  >
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              
              <div className="p-4 space-y-2">
                <button
                  onClick={() => {
                    setShowMobileMenu(false);
                    router.push('/');
                  }}
                  className="w-full text-left px-4 py-3 rounded-lg transition-colors text-white/70 hover:text-white hover:bg-white/10 block"
                >
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5v4" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v4" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 5v4" />
                    </svg>
                    <span>Home</span>
                  </div>
                </button>
                
                <button
                  onClick={() => {
                    setShowMobileMenu(false);
                    router.push('/projects');
                  }}
                  className="w-full text-left px-4 py-3 rounded-lg transition-colors text-white/70 hover:text-white hover:bg-white/10 block"
                >
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <span>Projects</span>
                  </div>
                </button>
                
                <button
                  onClick={() => {
                    setShowMobileMenu(false);
                    router.push('/community');
                  }}
                  className="w-full text-left px-4 py-3 rounded-lg transition-colors text-white/70 hover:text-white hover:bg-white/10 block"
                >
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span>Community</span>
                  </div>
                </button>
              </div>
            </div>
      </div>
        )}
      </header>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen"
      style={{ 
        background: 'radial-gradient(circle, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 61%, rgba(33, 33, 33, 1) 100%)',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      }}
    >
      {renderNavigation()}

      {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-32 sm:pt-40 pb-16 sm:pb-20">
          <div className="text-center">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white mb-4 sm:mb-6 leading-tight"
              style={{ fontFamily: 'Sniglet, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}
            >
              Give your idea a voice
            </motion.h1>
            
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg sm:text-xl text-white/80 mb-8 sm:mb-12 max-w-3xl mx-auto px-4"
            >
            {user ? 'Create and share voice agents by chatting with AI' : 'Create production-ready voice agents in seconds'}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="relative max-w-4xl mx-auto mb-6 sm:mb-8"
            >
              <div className="relative bg-gray-800 rounded-2xl sm:rounded-3xl p-3 sm:p-4 mx-4 sm:mx-0">
                <div className="flex items-center gap-2 sm:gap-4">
                  <div className="flex-1 relative">
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Describe the voice agent you want to create..."
                      className="w-full h-12 sm:h-16 p-3 sm:p-4 bg-transparent text-white placeholder-gray-400 focus:outline-none resize-none text-base sm:text-lg text-left"
                    disabled={isGenerating}
                    />
                  </div>
                  
                {user && (
                  <button
                    onClick={() => setIsPublic(!isPublic)}
                    disabled={isGenerating}
                    className={`px-4 py-2 rounded-full font-medium text-sm transition-all duration-200 ${
                      isPublic 
                        ? 'bg-blue-600 text-white hover:bg-blue-700' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isPublic ? '🌍 Public' : '🔒 Private'}
                  </button>
                )}
                
                <button
                  onClick={handleSubmit}
                  disabled={!prompt.trim() || isGenerating}
                  className="w-8 h-8 sm:w-10 sm:h-10 bg-white hover:bg-gray-200 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-all duration-200 flex-shrink-0"
                >
                  {isGenerating ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div>
                  ) : (
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

          {/* Example prompts */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-16 sm:mb-32 px-4"
            >
              {examplePrompts.map((example, index) => (
                <button
                  key={index}
                  onClick={() => setPrompt(example)}
                  className="bg-transparent border border-white/30 rounded-lg px-3 py-2 sm:px-4 sm:py-2 hover:bg-white/10 hover:border-white/50 transition-all duration-200 cursor-pointer text-white/70 hover:text-white text-xs sm:text-sm backdrop-blur-sm"
                disabled={isGenerating}
                >
                  {example}
                </button>
              ))}
            </motion.div>

          {/* Community Projects Section */}
          <CommunityProjectsSection 
            delay={0.6}
            variant="card"
            theme="light"
            title={user && projects.length > 0 ? "Community Projects" : undefined}
            showSearch={false}
            showFilters={false}
            limit={6}
            gridCols={3}
            projectType="community"
          />
        </div>
      </section>

      {/* User Projects Section - Only show if user is authenticated and has projects */}
      {user && projects.length > 0 && (
        <section className="bg-black px-6 py-16">
          <div className="max-w-7xl mx-auto">
            <CommunityProjectsSection 
              variant="card"
              theme="light"
              title="Your Projects"
              showSearch={false}
              showFilters={false}
              delay={0.5}
              limit={6}
              gridCols={3}
              projectType="user"
            />
          </div>
        </section>
      )}
    </motion.div>
  );
}

// Main page component that wraps HomeContent with Suspense
export default function HomePage() {
  return (
    <Suspense fallback={<LoadingPageWithTips />}>
      <HomeContent />
    </Suspense>
  );
}
