'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Room, RoomEvent, VideoPresets } from 'livekit-client';
import { 
  ArrowLeft,
  Square
} from 'lucide-react';
import {
  BarVisualizer,
  DisconnectButton,
  RoomAudioRenderer,
  RoomContext,
  VideoTrack,
  useVoiceAssistant
} from "@livekit/components-react";
import TranscriptionView from "@/components/TranscriptionView";
import { NoAgentNotification } from "@/components/NoAgentNotification";
import { LoadingSpinner } from '@/components/LoadingBun';

interface ProjectDetails {
  id: string;
  name: string;
  description: string | null;
  user_name: string | null;
  user_email: string;
  created_at: string;
  project_data?: {
    public_title?: string;
    public_description?: string;
    project_emoji?: string;
    system_prompt?: string;
    tts_provider?: string;
    tts_voice?: string;
    llm_model?: string;
    llm_provider?: string;
    stt_provider?: string;
    stt_language?: string;
  };
}

export default function CommunityProjectPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isInConversation, setIsInConversation] = useState(false);

  // Initialize room with proper configuration
  const [room] = useState(() =>
    new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: VideoPresets.h540.resolution,
      },
    }),
  );

  const fetchProject = async (projectId: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/community/projects/${projectId}`);
      
      if (!response.ok) {
        throw new Error('Project not found');
      }
      
      const data = await response.json();
      setProject(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTryProject = useCallback(async () => {
    if (!project || !user) return;

    console.log('🔥 Starting community project conversation!');
    console.log('   • Project ID:', project.id);
    console.log('   • User ID:', user.id);
    
    setIsConnecting(true);
    
    try {
      // IMMEDIATELY set conversation state to prevent any navigation
      setIsInConversation(true);
      console.log('🎯 Set isInConversation = true');

      // Use params.id as fallback if project.id is not available
      const projectId = project?.id || (typeof params.id === 'string' ? params.id : params.id?.[0]);
      console.log('📋 ProjectId to use for connection:', projectId);

      if (!projectId) {
        throw new Error('No project ID available');
      }

      // Generate room connection details with project ID
      const endpoint = process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? "/api/connection-details";
      const url = new URL(endpoint, window.location.origin);
      url.searchParams.set('projectId', projectId);
      url.searchParams.set('userId', user.id);
      
      console.log('📡 Fetching connection details:');
      console.log('   • URL:', url.toString());
      console.log('   • Project ID:', projectId);
      console.log('   • User ID:', user.id);
      
      const response = await fetch(url.toString());
      console.log('📡 Fetch response:');
      console.log('   • Status:', response.status);
      console.log('   • StatusText:', response.statusText);
      console.log('   • OK:', response.ok);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error text');
        console.error('❌ Fetch failed:', errorText);
        throw new Error(`Failed to get connection details: ${response.status} ${response.statusText}. Error: ${errorText}`);
      }
      
      const connectionDetailsData = await response.json();
      console.log('✅ Got connection details:');
      console.log('   • serverUrl:', connectionDetailsData.serverUrl);
      console.log('   • roomName:', connectionDetailsData.roomName);
      console.log('   • participantName:', connectionDetailsData.participantName);
      console.log('   • hasToken:', !!connectionDetailsData.participantToken);

      // Create explicit agent dispatch for this room
      console.log('🤖 Creating explicit agent dispatch...');
      console.log('📋 Project object:', project);
      console.log('📋 Project ID from object:', project?.id);
      console.log('📋 Params ID:', params.id);
      
      console.log('📋 Agent dispatch metadata:');
      console.log('   • Project ID:', projectId);
      console.log('   • User ID:', user.id);
      console.log('   • Is Community Project:', true);
      
      try {
        const dispatchResponse = await fetch('/api/agent-dispatch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            roomName: connectionDetailsData.roomName,
            agentName: 'voice-agent',
            projectId: projectId,
            userId: user.id,
            metadata: {
              projectId: projectId,
              userId: user.id,
              isCommunityProject: true,
              system_prompt: project.project_data?.system_prompt,
              tts_provider: project.project_data?.tts_provider,
              tts_voice: project.project_data?.tts_voice,
              llm_model: project.project_data?.llm_model,
              llm_provider: project.project_data?.llm_provider,
              stt_provider: project.project_data?.stt_provider,
              stt_language: project.project_data?.stt_language
            }
          })
        });

        console.log('🤖 Agent dispatch response:', dispatchResponse.status);
        
        if (!dispatchResponse.ok) {
          console.error('❌ Agent dispatch failed:', dispatchResponse.statusText);
          // Continue anyway - the agent may still work without explicit dispatch
        } else {
          console.log('✅ Agent dispatch successful');
        }
      } catch (dispatchError) {
        console.error('❌ Agent dispatch error:', dispatchError);
        // Continue anyway - the agent may still work without explicit dispatch
      }

      // Connect to the room
      console.log('🔌 Connecting to room...');
      console.log('   • Server URL:', connectionDetailsData.serverUrl);
      console.log('   • Room Name:', connectionDetailsData.roomName);
      console.log('   • Participant Name:', connectionDetailsData.participantName);
      
      await room.connect(connectionDetailsData.serverUrl, connectionDetailsData.participantToken, {
        autoSubscribe: true,
      });
      
      console.log('✅ Connected to room successfully!');
      console.log('   • Room state:', room.state);
      console.log('   • Room participants:', room.numParticipants);
      
    } catch (err) {
      console.error('❌ Connection failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setIsInConversation(false);
      setIsConnecting(false);
    } finally {
      console.log('🏁 Set isConnecting = false (finally block)');
      setIsConnecting(false);
    }
  }, [project, user, params.id, room]);

  useEffect(() => {
    if (params.id && typeof params.id === 'string') {
      fetchProject(params.id);
    }
  }, [params.id]);

  // Auto-start conversation when project loads and user is authenticated
  useEffect(() => {
    if (project && user && !isInConversation && !isConnecting) {
      handleTryProject();
    } else if (project && !user) {
      // Redirect to sign in if user is not authenticated
      router.push('/auth?returnTo=' + encodeURIComponent(window.location.pathname));
    }
  }, [project, user, isInConversation, isConnecting, handleTryProject, router]);

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

  // Voice Assistant Components
  function SimpleVoiceAssistant() {
    const { state: agentState } = useVoiceAssistant();

    return (
      <>
        <AnimatePresence mode="wait">
          {agentState === "disconnected" ? (
            <motion.div
              key="disconnected"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, ease: [0.09, 1.04, 0.245, 1.055] }}
              className="grid items-center justify-center h-full"
            >
              {isConnecting ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="flex items-center justify-center text-white text-lg"
                >
                  <LoadingSpinner size="lg" color="white" className="mr-2" />
                  Creating Agent Session...
                </motion.div>
              ) : (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="px-8 py-4 bg-black hover:bg-gray-900 text-white font-medium rounded-lg transition-colors text-lg border border-white/20"
                  onClick={handleTryProject}
                >
                  Try This Agent
                </motion.button>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="connected"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: [0.09, 1.04, 0.245, 1.055] }}
              className="flex flex-col items-center h-full bg-black"
              style={{ '--lk-bg': '#000000' } as React.CSSProperties}
            >
              <AgentVisualizer />
              <div className="flex-1 w-full bg-black">
                <TranscriptionView />
              </div>
              <div className="w-full bg-black">
                <ConversationControlBar />
              </div>
              <RoomAudioRenderer />
              <NoAgentNotification state={agentState} />
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  function AgentVisualizer() {
    const { state: agentState, videoTrack, audioTrack } = useVoiceAssistant();

    if (videoTrack) {
      return (
        <div className="h-[200px] w-[200px] sm:h-[300px] sm:w-[300px] md:h-[512px] md:w-[512px] rounded-lg overflow-hidden bg-black">
          <VideoTrack trackRef={videoTrack} />
        </div>
      );
    }
    return (
      <div className="h-[20px] w-full bg-black">
        <BarVisualizer
          state={agentState}
          barCount={5}
          trackRef={audioTrack}
          className="agent-visualizer"
          options={{ minHeight: 12 }}
        />
      </div>
    );
  }

  function ConversationControlBar() {
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
              className="flex h-8 absolute left-1/2 -translate-x-1/2 justify-center"
            >
              <DisconnectButton>
                <Square className="w-4 h-4" />
              </DisconnectButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <LoadingSpinner size="lg" color="white" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Project Not Found</h1>
          <p className="text-white/60 mb-6">{error}</p>
          <Link
            href="/community"
            className="inline-flex items-center px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Community
          </Link>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Project Not Found</h1>
          <Link
            href="/community"
            className="inline-flex items-center px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Community
          </Link>
        </div>
      </div>
    );
  }

  return (
    <RoomContext.Provider value={room}>
      <div className="min-h-screen bg-black">
        {isInConversation ? (
          <div className="h-screen w-full">
            <SimpleVoiceAssistant />
          </div>
        ) : isConnecting ? (
          <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="text-center">
              <LoadingSpinner size="lg" color="white" />
              <h2 className="text-xl font-semibold text-white mt-4 mb-2">Connecting to Voice Agent</h2>
              <p className="text-white/60">
                {project?.project_data?.public_title || project?.name}
              </p>
            </div>
          </div>
        ) : (
          <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="text-center">
              <LoadingSpinner size="lg" color="white" />
              <h2 className="text-xl font-semibold text-white mt-4 mb-2">Loading Voice Agent</h2>
              <p className="text-white/60">
                {project?.project_data?.public_title || project?.name || 'Preparing your experience...'}
              </p>
            </div>
          </div>
        )}
      </div>
    </RoomContext.Provider>
  );
} 