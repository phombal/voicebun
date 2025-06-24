'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Project, VoiceAgentConfig as VoiceAgentConfigType } from '@/lib/database/types';
import { useDatabase } from '@/hooks/useDatabase';
import { GeneratedCodeDisplay } from '@/components/GeneratedCodeDisplay';
import { LoadingBun } from '@/components/LoadingBun';

export default function ProjectPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { getUserProjects, setCurrentProject } = useDatabase();
  const [project, setProject] = useState<Project | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [config, setConfig] = useState<VoiceAgentConfigType | null>(null);
  const [code, setCode] = useState<string>("");
  
  // Safari session validation ref to prevent multiple validations
  const safariValidationRef = useRef(false);

  // Function to track project views
  const trackProjectView = async (projectId: string) => {
    try {
      await fetch(`/api/projects/${projectId}/view`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      console.log('📊 Project view tracked for:', projectId);
    } catch (error) {
      console.error('Failed to track project view:', error);
      // Don't throw error - view tracking is not critical for user experience
    }
  };

  // Safari-specific session validation
  const validateSafariSession = useCallback(async () => {
    if (typeof window === 'undefined') return false;
    
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent) ||
                    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                    (navigator.vendor && navigator.vendor.indexOf('Apple') > -1);
    
    if (!isSafari) return false;
    
    // Prevent multiple validations
    if (safariValidationRef.current) {
      console.log('🍎 Safari validation already in progress');
      return false;
    }
    
    safariValidationRef.current = true;
    
    try {
      console.log('🍎 Safari session validation for project page:', {
        hasUser: !!user,
        loading,
        projectId,
        currentPath: window.location.pathname
      });
      
      // Check if we have auth tokens in storage
      const storageKey = 'sb-auth-token';
      const accessTokenKey = `${storageKey}-access-token`;
      
      let hasTokens = false;
      try {
        hasTokens = !!(window.localStorage.getItem(accessTokenKey) || 
                      window.sessionStorage.getItem(accessTokenKey));
      } catch (storageError) {
        console.warn('🍎 Storage access failed:', storageError);
      }
      
      console.log('🍎 Safari token check:', {
        hasTokens,
        hasUser: !!user,
        loading
      });
      
      // If we have tokens but no user and not loading, there might be a session issue
      if (hasTokens && !user && !loading) {
        console.log('🍎 Safari: Tokens found but no user - possible session desync');
        
        // Give the auth system a moment to catch up
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check again
        if (!user && !loading) {
          console.log('🍎 Safari: Session desync confirmed, redirecting to home');
          router.push('/');
          return true;
        }
      }
      
      return false;
    } finally {
      safariValidationRef.current = false;
    }
  }, [user, loading, router, projectId]);

  // Redirect unauthenticated users to landing with Safari validation
  useEffect(() => {
    const handleAuthRedirect = async () => {
      console.log('🔐 Project auth check:', {
        loading,
        hasUser: !!user,
        userId: user?.id,
        projectId,
        userAgent: typeof window !== 'undefined' ? navigator.userAgent.substring(0, 50) : 'server'
      });
      
      if (!loading && !user) {
        console.log('❌ No authenticated user, redirecting to home');
        router.push('/');
        return;
      }
      
      // Safari-specific validation
      if (!loading) {
        const safariHandled = await validateSafariSession();
        if (safariHandled) {
          console.log('🍎 Safari validation handled redirect');
          return;
        }
      }
    };
    
    handleAuthRedirect();
  }, [user, loading, router, validateSafariSession]);

  // Load project data
  useEffect(() => {
    if (!user || !projectId) return;
    
    const loadProject = async () => {
      try {
        const userProjects = await getUserProjects();
        const foundProject = userProjects.find((p: Project) => p.id === projectId);
        
        if (!foundProject) {
          router.push('/projects');
          return;
        }

        console.log('📦 Setting project state:', foundProject.id, foundProject.name);
        setProject(foundProject);

        // Set this as the current project in the database hook
        console.log('🎯 Setting current project in useDatabase hook:', foundProject.id);
        setCurrentProject(foundProject);
        console.log('✅ Current project set in useDatabase hook');

        // Track the view after successfully loading the project
        await trackProjectView(foundProject.id);

        // Reconstruct config from project data
        const agentConfig: VoiceAgentConfigType = {
          prompt: foundProject.initial_prompt || "",
          personality: foundProject.config?.personality || "friendly",
          capabilities: foundProject.config?.capabilities || [],
          language: foundProject.config?.language || "english",
          responseStyle: foundProject.config?.responseStyle || "conversational"
        };
        
        setConfig(agentConfig);

        // Generate a basic code template since we no longer store files
        const basicCode = `from dotenv import load_dotenv
from livekit import agents
from livekit.agents import AgentSession, Agent
from livekit.plugins import openai, cartesia, deepgram, silero

load_dotenv()

class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(instructions="${agentConfig.prompt}")

async def entrypoint(ctx: agents.JobContext):
    session = AgentSession(
        stt=deepgram.STT(model="nova-3"),
        llm=openai.LLM(model="gpt-4o-mini"),
        tts=cartesia.TTS(),
        vad=silero.VAD.load(),
    )
    
    assistant = Assistant()
    await session.astart(ctx.room, assistant)

if __name__ == "__main__":
    agents.cli.run_app(entrypoint)`;
        
        setCode(basicCode);
        
      } catch (error) {
        console.error('Failed to load project:', error);
        router.push('/projects');
      } finally {
        setLoadingProject(false);
      }
    };

    loadProject();
  }, [getUserProjects, user, projectId, router, setCurrentProject]);

  const handleBackToHome = () => {
    router.push('/dashboard');
  };

  const handleStartConversation = () => {
    router.push(`/projects/${projectId}/conversation`);
  };

  const handleProjectUpdate = (updatedProject: Project) => {
    console.log('📝 Updating project state:', updatedProject.name);
    setProject(updatedProject);
    // Also update the current project in the database hook
    setCurrentProject(updatedProject);
  };

  if (loading || loadingProject) {
    return <LoadingBun message="Loading project..." />;
  }

  if (!user || !project || !config) {
    return null; // Will redirect
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col min-h-screen"
    >
      <GeneratedCodeDisplay
        code={code}
        config={config}
        project={project}
        onStartConversation={handleStartConversation}
        onBackToHome={handleBackToHome}
        onProjectUpdate={handleProjectUpdate}
      />
    </motion.div>
  );
} 