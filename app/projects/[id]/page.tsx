'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
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

  // Function to clear stuck auth state
  const clearAuthState = useCallback(() => {
    try {
      console.log('🧹 Clearing potentially stuck auth state...');
      // Clear Supabase auth tokens
      const keysToCheck = ['sb-auth-token', 'sb-session'];
      keysToCheck.forEach(key => {
        try {
          localStorage.removeItem(key);
          sessionStorage.removeItem(key);
          // Also check with project-specific keys
          localStorage.removeItem(`${key}-access-token`);
          sessionStorage.removeItem(`${key}-access-token`);
          localStorage.removeItem(`${key}-refresh-token`);
          sessionStorage.removeItem(`${key}-refresh-token`);
        } catch (err) {
          console.warn(`Failed to clear ${key}:`, err);
        }
      });
      console.log('✅ Auth state cleared');
    } catch (error) {
      console.error('Failed to clear auth state:', error);
    }
  }, []);

  // Expose clear function to window for manual debugging
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).clearVoiceBunAuth = () => {
        clearAuthState();
        window.location.href = '/';
      };
    }
  }, [clearAuthState]);

  // Simple auth check with timeout to prevent endless loops
  useEffect(() => {
    // Set a maximum wait time for auth to resolve
    const authTimeout = setTimeout(() => {
      if (loading) {
        console.log('⏰ Auth timeout reached, clearing state and redirecting');
        clearAuthState();
        router.push('/');
      }
    }, 6000); // 6 second timeout (slightly longer than AuthContext's 5 seconds)

    // Clear timeout if auth resolves
    if (!loading) {
      clearTimeout(authTimeout);
      
      if (!user) {
        console.log('❌ No authenticated user, redirecting to home');
        router.push('/');
      }
    }

    return () => clearTimeout(authTimeout);
  }, [user, loading, router, clearAuthState]);

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
    router.push('/');
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
    <div className="flex flex-col min-h-screen">
      <GeneratedCodeDisplay
        code={code}
        config={config}
        project={project}
        onStartConversation={handleStartConversation}
        onBackToHome={handleBackToHome}
        onProjectUpdate={handleProjectUpdate}
      />
    </div>
  );
} 