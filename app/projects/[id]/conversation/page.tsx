'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Project as DatabaseProject } from '@/lib/database/types';
import { VoiceAgentConfig as VoiceAgentConfigType } from '@/lib/database/types';
import { useDatabase } from '@/hooks/useDatabase';
import { Room, RoomEvent } from 'livekit-client';
import { RoomAudioRenderer } from '@livekit/components-react';
import { useVoiceAssistant } from '@livekit/components-react';
import { BarVisualizer } from '@livekit/components-react';
import { VideoTrack } from '@livekit/components-react';
import { VoiceAssistantControlBar } from '@livekit/components-react';
import { DisconnectButton } from '@livekit/components-react';
import { NoAgentNotification } from '@/components/NoAgentNotification';
import DatabaseTranscriptionView from '@/components/DatabaseTranscriptionView';
import { AnimatePresence } from 'framer-motion';
import { CloseIcon } from '@/components/CloseIcon';

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

interface ConnectionDetails {
  serverUrl: string;
  roomName: string;
  participantToken: string;
  participantName: string;
}

export default function ConversationPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { getUserProjects } = useDatabase();
  const [project, setProject] = useState<Project | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [config, setConfig] = useState<VoiceAgentConfigType | null>(null);
  const [room] = useState(new Room());
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

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
        const foundProject = userProjects.find((p: DatabaseProject) => p.id === projectId);
        
        if (!foundProject) {
          router.push('/projects');
          return;
        }

        const projectData: Project = {
          ...foundProject,
          description: foundProject.description || undefined
        };

        setProject(projectData);

        // Reconstruct config from project data
        const agentConfig: VoiceAgentConfigType = {
          prompt: foundProject.initial_prompt || "",
          personality: foundProject.config?.personality || "friendly",
          capabilities: foundProject.config?.capabilities || [],
          language: foundProject.config?.language || "english",
          responseStyle: foundProject.config?.responseStyle || "conversational"
        };
        
        setConfig(agentConfig);
        
      } catch (error) {
        console.error('Failed to load project:', error);
        router.push('/projects');
      } finally {
        setLoadingProject(false);
      }
    };

    loadProject();
  }, [getUserProjects, user, projectId, router]);

  const connectToRoom = useCallback(async () => {
    if (!config) return;
    
    setIsConnecting(true);
    
    try {
      // Generate room connection details
      const url = new URL(
        process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? "/api/connection-details",
        window.location.origin
      );
      
      console.log('📡 Fetching connection details from:', url.toString());
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error(`Failed to get connection details: ${response.status} ${response.statusText}`);
      }
      
      const connectionDetailsData: ConnectionDetails = await response.json();
      console.log('✅ Got connection details:', {
        roomName: connectionDetailsData.roomName,
        hasToken: !!connectionDetailsData.participantToken,
        hasServerUrl: !!connectionDetailsData.serverUrl
      });

      // Connect to room first
      await room.connect(connectionDetailsData.serverUrl, connectionDetailsData.participantToken);
      
      console.log('✅ Connected to room successfully');
      
      // Wait a moment for connection to be fully established
      console.log('⏳ Waiting for connection to stabilize before setting metadata...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Then set metadata with configuration information
      const roomMetadata = {
        projectId: projectId,
        userId: user?.id,
        agentConfig: config,
        timestamp: new Date().toISOString()
      };
      
      // Set participant metadata after connection
      console.log('📋 Setting participant metadata for project:', projectId);
      
      try {
        await room.localParticipant.setMetadata(JSON.stringify(roomMetadata));
        console.log('✅ Successfully set participant metadata');
      } catch (error) {
        console.error('❌ Failed to set participant metadata:', error);
      }
      
      await room.localParticipant.setMicrophoneEnabled(true);
      
      console.log('✅ Connected to room successfully with configuration metadata');
      console.log('👥 Current participants:', room.remoteParticipants.size);
      
      // Wait for the room to be fully established and for any agents to join
      console.log('⏳ Waiting for room to stabilize...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      console.log('👥 Participants after wait:', room.remoteParticipants.size);
      console.log('🎉 Conversation should now be active');
      
      setIsConnected(true);
      
    } catch (error) {
      console.error('❌ Failed to connect to room:', error);
      
      // Show error notification
      const notification = document.createElement('div');
      notification.textContent = `Failed to start conversation: ${error instanceof Error ? error.message : 'Unknown error'}`;
      notification.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 max-w-sm';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 5000);
    } finally {
      setIsConnecting(false);
    }
  }, [config, projectId, room, user]);

  // Auto-connect when component loads
  useEffect(() => {
    if (project && config && !isConnecting && !isConnected) {
      connectToRoom();
    }
  }, [project, config, isConnecting, isConnected, connectToRoom]);

  const handleBackToProject = () => {
    router.push(`/projects/${projectId}`);
  };

  const handleBackToHome = () => {
    router.push('/dashboard');
  };

  // Room event handling
  useEffect(() => {
    const onDeviceFailure = (error: Error) => {
      console.error('Device failure:', error);
      const notification = document.createElement('div');
      notification.textContent = 'Error accessing microphone. Please check permissions and reload.';
      notification.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 5000);
    };

    room.on(RoomEvent.MediaDevicesError, onDeviceFailure);

    return () => {
      room.off(RoomEvent.MediaDevicesError, onDeviceFailure);
    };
  }, [room]);

  if (loading || loadingProject) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading conversation...</p>
        </div>
      </div>
    );
  }

  if (!user || !project || !config) {
    return null; // Will redirect
  }

  if (isConnecting) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Connecting to voice agent...</p>
          <p className="text-gray-500 text-sm mt-2">This may take a few moments</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col min-h-screen bg-gray-900"
    >
      <SimpleVoiceAssistant 
        onReconfigure={handleBackToProject}
        onBackToHome={handleBackToHome}
        projectName={project.name}
        room={room}
      />
      <RoomAudioRenderer />
    </motion.div>
  );
}

function SimpleVoiceAssistant(props: { 
  onReconfigure: () => void; 
  onBackToHome: () => void;
  projectName: string;
  room: Room;
}) {
  const { state: agentState } = useVoiceAssistant();

  return (
    <div className="flex flex-col items-center gap-4 h-full bg-gray-900" style={{ '--lk-bg': '#111827' } as React.CSSProperties}>
      {/* Header */}
      <header className="w-full border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">{props.projectName}</h1>
              <p className="text-gray-400 text-sm">Voice conversation mode</p>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${
                agentState === 'listening' ? 'bg-green-500' :
                agentState === 'thinking' ? 'bg-yellow-500' :
                agentState === 'speaking' ? 'bg-blue-500' :
                'bg-gray-500'
              }`}></div>
              <span className="text-gray-400 text-sm capitalize">{agentState}</span>
            </div>
          </div>
        </div>
      </header>

      <AgentVisualizer />
      <div className="flex-1 w-full bg-gray-900 max-w-4xl mx-auto px-6">
        <DatabaseTranscriptionView />
      </div>
      <div className="w-full bg-gray-900">
        <ConversationControlBar 
          onReconfigure={props.onReconfigure}
          onBackToHome={props.onBackToHome}
        />
      </div>
      <NoAgentNotification state={agentState} />
    </div>
  );
}

function AgentVisualizer() {
  const { state: agentState, videoTrack, audioTrack } = useVoiceAssistant();

  if (videoTrack) {
    return (
      <div className="h-[512px] w-[512px] rounded-lg overflow-hidden bg-gray-900">
        <VideoTrack trackRef={videoTrack} />
      </div>
    );
  }
  return (
    <div className="h-[300px] w-full max-w-2xl mx-auto">
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

function ConversationControlBar(props: { onReconfigure: () => void; onBackToHome: () => void }) {
  const { state: agentState } = useVoiceAssistant();

  return (
    <div className="relative h-[80px] bg-gray-900 border-t border-gray-800">
      <div className="max-w-4xl mx-auto px-6 py-4">
        <AnimatePresence>
          {agentState !== "disconnected" && agentState !== "connecting" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: [0.09, 1.04, 0.245, 1.055] }}
              className="flex h-full justify-center items-center space-x-4"
            >
              <VoiceAssistantControlBar controls={{ leave: false }} />
              <DisconnectButton>
                <CloseIcon />
              </DisconnectButton>
              <motion.button
                onClick={props.onReconfigure}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded-md transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Back to Project
              </motion.button>
              <motion.button
                onClick={props.onBackToHome}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Dashboard
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
} 