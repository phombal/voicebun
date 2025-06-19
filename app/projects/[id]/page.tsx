'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Project, VoiceAgentConfig as VoiceAgentConfigType } from '@/lib/database/types';
import { useDatabase } from '@/hooks/useDatabase';
import { GeneratedCodeDisplay } from '@/components/GeneratedCodeDisplay';

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

  // Redirect unauthenticated users to landing
  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

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
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading project...</p>
        </div>
      </div>
    );
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