'use client';

import { useEffect, useCallback, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Room, RoomEvent, VideoPresets } from 'livekit-client';
import { ArrowLeft } from 'lucide-react';
import {
  BarVisualizer,
  RoomAudioRenderer,
  RoomContext,
  useVoiceAssistant
} from "@livekit/components-react";
import TranscriptionView from "@/components/TranscriptionView";
import { NoAgentNotification } from "@/components/NoAgentNotification";
import { LoadingSpinner } from '@/components/LoadingBun';
import { AgentControlBar } from '@/components/livekit/agent-control-bar/agent-control-bar';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isInConversation, setIsInConversation] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [hasManuallyDisconnected, setHasManuallyDisconnected] = useState(false);

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

  // Capabilities for the agent control bar
  const capabilities = {
    chat: true,
    microphone: true,
    camera: false,
    screenshare: false
  };

  const fetchProject = useCallback(async (projectId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/community/projects/${projectId}`);
      
      if (!response.ok) {
        throw new Error('Project not found');
      }
      
      const data = await response.json();
      setProject(data.project);
      
      // Track the view after successfully loading the project
      trackProjectView(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, []);

  // Function to track project views
  const trackProjectView = async (projectId: string) => {
    try {
      await fetch(`/api/community/projects/${projectId}/view`, {
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

  const handleTryProject = useCallback(async () => {
    if (!project || !user) return;

    console.log('🔥 CLICKED TRY COMMUNITY PROJECT!');
    console.log('🔍 Initial state check:');
    console.log('   • isConnecting:', isConnecting);
    console.log('   • isInConversation:', isInConversation);
    console.log('   • project:', project?.id || 'NONE');
    console.log('   • user:', user?.id || 'NONE');
    
    setIsConnecting(true);
    console.log('⏳ Set isConnecting = true');
    
    try {
      console.log('🚀 Starting community project conversation...');
      
      // IMMEDIATELY set conversation state to prevent any navigation
      setIsInConversation(true);
      console.log('🎯 Set isInConversation = true');

      // Use params.id as fallback if project.id is not available
      const projectId = project?.id || (typeof params.id === 'string' ? params.id : params.id?.[0]);
      console.log('📦 Using project ID:', projectId);

      if (!projectId) {
        throw new Error('No project ID available for conversation');
      }

      // Generate room connection details with project ID
      const endpoint = process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? "/api/connection-details";
      const url = new URL(endpoint, window.location.origin);
      url.searchParams.set('projectId', projectId);
      url.searchParams.set('userId', user.id);
      
      console.log('📡 Fetching connection details:');
      console.log('   • URL:', url.toString());
      console.log('   • Endpoint:', endpoint);
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
      console.log('   • tokenLength:', connectionDetailsData.participantToken?.length || 0);

      // Create explicit agent dispatch for this room
      console.log('🤖 Creating explicit agent dispatch...');
      const agentMetadata = {
        projectId: projectId,
        userId: user.id,
        isCommunityProject: true,
        agentConfig: {
          prompt: project.project_data?.system_prompt || `You are a helpful voice assistant for ${project.name}.`
        },
        modelConfigurations: {
          // LLM Configuration
          llm: {
            provider: project.project_data?.llm_provider || 'openai',
            model: project.project_data?.llm_model || 'gpt-4o-mini',
            temperature: 0.7,
            maxResponseLength: 150
          },
          // STT Configuration
          stt: {
            provider: project.project_data?.stt_provider || 'deepgram',
            language: project.project_data?.stt_language || 'en',
            quality: 'enhanced',
            processingMode: 'streaming',
            noiseSuppression: true,
            autoPunctuation: true
          },
          // TTS Configuration
          tts: {
            provider: project.project_data?.tts_provider || 'cartesia',
            voice: project.project_data?.tts_voice || 'neutral'
          },
          // Additional configurations
          firstMessageMode: 'wait_for_user',
          responseLatencyPriority: 'balanced'
        }
      };

      console.log('📋 Agent dispatch metadata:');
      console.log('   • Project ID:', projectId);
      console.log('   • User ID:', user.id);
      console.log('   • Is Community Project:', true);
      console.log('   • System Prompt Length:', (project.project_data?.system_prompt || '').length, 'characters');
      console.log('   • LLM Provider/Model:', `${agentMetadata.modelConfigurations.llm.provider}/${agentMetadata.modelConfigurations.llm.model}`);
      console.log('   • STT Provider/Language:', `${agentMetadata.modelConfigurations.stt.provider}/${agentMetadata.modelConfigurations.stt.language}`);
      console.log('   • TTS Provider/Voice:', `${agentMetadata.modelConfigurations.tts.provider}/${agentMetadata.modelConfigurations.tts.voice}`);
      
      try {
        console.log('🚀 Creating agent dispatch with metadata:');
        console.log('   • Room Name:', connectionDetailsData.roomName);
        console.log('   • Agent Name:', 'voice-agent');
        console.log('   • Project ID:', projectId);
        console.log('   • User ID:', user.id);
        console.log('   • User Object:', user);
        
        const dispatchPayload = {
          roomName: connectionDetailsData.roomName,
          agentName: 'voice-agent',
          projectId: projectId,
          userId: user.id,
          metadata: {
            projectId: projectId,
            userId: user.id,
            isCommunityProject: true,
            userEmail: user.email || '',
            userName: user.user_metadata?.full_name || user.email || 'Anonymous',
            timestamp: new Date().toISOString(),
            agentConfig: agentMetadata.agentConfig,
            modelConfigurations: agentMetadata.modelConfigurations
          }
        };
        
        console.log('📋 Full dispatch payload:');
        console.log(JSON.stringify(dispatchPayload, null, 2));
        
        const dispatchResponse = await fetch('/api/agent-dispatch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(dispatchPayload),
        });

        if (!dispatchResponse.ok) {
          const dispatchError = await dispatchResponse.json();
          throw new Error(`Failed to create agent dispatch: ${dispatchError.error || 'Unknown error'}`);
        }

        const dispatchResult = await dispatchResponse.json();
        console.log('✅ Agent dispatch created successfully:', dispatchResult);
        console.log('🔍 Checking returned metadata:', dispatchResult.metadata);
        
        // Parse and log the metadata to verify userId is included
        try {
          const parsedMetadata = JSON.parse(dispatchResult.metadata || '{}');
          console.log('📊 Parsed metadata contains:');
          console.log('   • Project ID:', parsedMetadata.projectId);
          console.log('   • User ID:', parsedMetadata.userId);
          console.log('   • Is Community Project:', parsedMetadata.isCommunityProject);
          console.log('   • User Email:', parsedMetadata.userEmail);
          console.log('   • User Name:', parsedMetadata.userName);
        } catch (parseError) {
          console.error('❌ Failed to parse returned metadata:', parseError);
        }
      } catch (dispatchError) {
        console.error('❌ Failed to create agent dispatch:', dispatchError);
        // Don't throw here - we can still try to connect and the agent might pick up from room metadata
        console.log('⚠️ Continuing with room connection anyway...');
      }

      // Connect to room with user metadata
      console.log('🔌 Connecting to LiveKit room...');
      console.log('   • Room state before connect:', room.state);
      console.log('   • Server URL:', connectionDetailsData.serverUrl);
      console.log('   • Token length:', connectionDetailsData.participantToken?.length);
      console.log('   • Room name:', connectionDetailsData.roomName);
      
      try {
        await room.connect(connectionDetailsData.serverUrl, connectionDetailsData.participantToken);
        
        // Set participant metadata after successful connection
        const userMetadata = JSON.stringify({
          userId: user.id,
          projectId: projectId,
          isCommunityProject: true,
          userEmail: user.email || '',
          userName: user.user_metadata?.full_name || user.email || 'Anonymous',
          timestamp: new Date().toISOString()
        });
        
        await room.localParticipant.setMetadata(userMetadata);
        
        console.log('✅ Connected to room successfully with user metadata');
        console.log('   • Room state after connect:', room.state);
        console.log('   • Room participants:', room.remoteParticipants.size);
        console.log('   • Local participant:', room.localParticipant.identity);
        console.log('   • Local participant metadata:', room.localParticipant.metadata);
        console.log('   • Room name:', room.name);
      } catch (connectionError) {
        console.error('❌ LiveKit room connection failed:', connectionError);
        throw new Error(`Failed to connect to LiveKit room: ${connectionError instanceof Error ? connectionError.message : 'Unknown connection error'}`);
      }
      
      console.log('🎤 Enabling microphone...');
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        console.log('✅ Microphone enabled');
        console.log('   • Audio tracks count:', Array.from(room.localParticipant.audioTrackPublications.values()).length);
      } catch (micError) {
        console.error('❌ Failed to enable microphone:', micError);
        // Show user-friendly error
        const notification = document.createElement('div');
        notification.textContent = 'Microphone access error. Please check your permissions.';
        notification.className = 'fixed bottom-4 right-4 bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
        document.body.appendChild(notification);
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
        }, 5000);
        console.log('⚠️ Continuing without microphone...');
      }
      
      console.log('🎉 Community project conversation setup complete!');
      console.log('   • Project ID:', projectId);
      console.log('   • Room state:', room.state);
      console.log('   • isInConversation:', true);
      
    } catch (error) {
      console.error('❌ COMMUNITY PROJECT CONVERSATION START FAILED:');
      console.error('   • Error type:', error instanceof Error ? error.constructor.name : typeof error);
      console.error('   • Error message:', error instanceof Error ? error.message : String(error));
      console.error('   • Full error:', error);
      
      setIsInConversation(false);
      console.log('🔄 Reset isInConversation = false due to error');
      
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
      console.log('🏁 Set isConnecting = false (finally block)');
    }
  }, [project, user, params.id, room, isConnecting, isInConversation]);

  useEffect(() => {
    if (params.id && typeof params.id === 'string') {
      fetchProject(params.id);
    }
  }, [params.id, fetchProject]);

  // Auto-start conversation when project loads and user is authenticated
  useEffect(() => {
    if (project && user && !isInConversation && !isConnecting && !hasManuallyDisconnected) {
      handleTryProject();
    } else if (project && !user) {
      // Redirect to sign in if user is not authenticated
      router.push('/auth?returnTo=' + encodeURIComponent(window.location.pathname));
    }
  }, [project, user, isInConversation, isConnecting, hasManuallyDisconnected, handleTryProject, router]);

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

    const onRoomDisconnected = () => {
      console.log('Room disconnected, redirecting to community page...');
      setIsInConversation(false);
      setIsConnecting(false);
      setIsDisconnecting(false);
      // Immediate redirect to prevent loading state flash
      router.push('/community');
    };

    room.on(RoomEvent.MediaDevicesError, onDeviceFailure);
    room.on(RoomEvent.Disconnected, onRoomDisconnected);

    return () => {
      room.off(RoomEvent.MediaDevicesError, onDeviceFailure);
      room.off(RoomEvent.Disconnected, onRoomDisconnected);
    };
  }, [room, router]);

  // Cleanup session when user leaves the page
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isInConversation && room.state === 'connected') {
        console.log('🚪 User leaving page - disconnecting from room');
        room.disconnect();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && isInConversation && room.state === 'connected') {
        console.log('👁️ Page hidden - disconnecting from room');
        room.disconnect();
      }
    };

    // Handle page unload (navigation, tab close, browser close)
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Handle page visibility change (tab switching, minimizing)
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup function when component unmounts
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      // Disconnect room if still connected when component unmounts
      if (isInConversation && room.state === 'connected') {
        console.log('🧹 Component unmounting - disconnecting from room');
        room.disconnect();
      }
    };
  }, [isInConversation, room]);

  // Voice Assistant Components
  function SimpleVoiceAssistant() {
    const { state: agentState } = useVoiceAssistant();

    return (
      <>
          {agentState === "disconnected" ? (
            <div
              className="grid items-center justify-center h-full"
            >
              {isConnecting || isDisconnecting ? (
                <div
                  className="flex items-center justify-center text-white text-lg"
                >
                  <LoadingSpinner size="lg" color="white" className="mr-2" />
                  {isDisconnecting ? 'Disconnecting...' : 'Creating Agent Session...'}
                </div>
              ) : (
                <button
                  className="px-8 py-4 bg-black hover:bg-gray-900 text-white font-medium rounded-lg transition-colors text-lg border border-white/20"
                  onClick={handleTryProject}
                >
                  Try This Agent
                </button>
              )}
            </div>
          ) : (
            <div
              className="relative min-h-screen bg-black"
              style={{ '--lk-bg': '#000000' } as React.CSSProperties}
            >
              {/* Top gradient overlay */}
              <div className="fixed top-0 right-0 left-0 h-32 md:h-36 bg-gradient-to-b from-black to-transparent z-10" />
              
              {/* Main content area with transcription */}
              <div className="pt-32 pb-40 px-3 md:px-0 md:pt-36 md:pb-48">
                <div className="mx-auto min-h-[60vh] w-full max-w-2xl">
                  <TranscriptionView />
                </div>
              </div>
              
              {/* Audio Visualizer - Centered on screen */}
              <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-20">
                <AudioVisualizerSection />
              </div>
              
              {/* Bottom controls */}
              <div className="fixed right-0 bottom-0 left-0 z-50 px-3 pt-2 pb-3 md:px-12 md:pb-12 bg-gradient-to-t from-black to-transparent">
                <div>
                  <div className="relative z-10 mx-auto w-full max-w-2xl">
                    <div
                      className="absolute inset-x-0 -top-12 text-center pointer-events-none"
                    >
                      <p className="inline-block text-sm font-semibold text-white/70">
                        Agent is listening, start speaking
                      </p>
                    </div>
                    
                    <ConversationControlBar />
              </div>
            </div>
              </div>
              
              <RoomAudioRenderer />
              <NoAgentNotification state={agentState} />
            </div>
          )}
      </>
    );
  }

  function AudioVisualizerSection() {
    const { state: agentState, audioTrack } = useVoiceAssistant();

    return (
      <div className="text-center pointer-events-none">
        <div className="h-48 w-full max-w-lg">
          {/* BarVisualizer - Primary visualization */}
          <div className="w-full h-full flex items-center justify-center">
            <BarVisualizer
              state={agentState}
              barCount={24}
              trackRef={audioTrack}
              className="custom-audio-visualizer"
              options={{ minHeight: 30, maxHeight: 120 }}
            />
          </div>
        </div>
      </div>
    );
  }

  function ConversationControlBar() {
    const handleEndCall = async () => {
      console.log('User manually ending call...');
      setIsDisconnecting(true);
      setHasManuallyDisconnected(true);
      try {
        await room.disconnect();
        // The room disconnection event will handle the redirect
      } catch (error) {
        console.error('Error disconnecting from room:', error);
        // Fallback: direct redirect if disconnect fails
        setIsInConversation(false);
        setIsConnecting(false);
        setIsDisconnecting(false);
        router.push('/community');
      }
    };

    return (
      <div className="flex items-center justify-center">
        <AgentControlBar
          capabilities={capabilities}
          room={room}
          onEndCall={handleEndCall}
        />
      </div>
    );
  }

  if (loading) {
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
      <style jsx global>{`
        /* BarVisualizer container */
        .custom-audio-visualizer {
          width: 100% !important;
          height: 100% !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }

        /* LiveKit BarVisualizer styles */
        .lk-audio-visualizer {
          width: 100% !important;
          height: 100% !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 4px !important;
          background: transparent !important;
        }

        /* Individual bars */
        .lk-audio-visualizer-bar {
          background: rgba(255, 255, 255, 0.6) !important;
          border-radius: 8px !important;
          width: 8px !important;
          min-height: 30px !important;
          transition: all 0.3s ease !important;
          box-shadow: 0 0 15px rgba(255, 255, 255, 0.3) !important;
        }

        /* Active state */
        .lk-audio-visualizer-bar.lk-audio-visualizer-bar-active {
          background: rgba(255, 255, 255, 0.9) !important;
          box-shadow: 0 0 25px rgba(255, 255, 255, 0.6) !important;
          transform: scaleY(1.2) !important;
        }

        /* Speaking state */
        .lk-audio-visualizer-bar.lk-audio-visualizer-bar-highlighted {
          background: rgba(255, 255, 255, 1) !important;
          box-shadow: 0 0 30px rgba(255, 255, 255, 0.8) !important;
          transform: scaleY(1.4) !important;
        }
      `}</style>
      
      <div className="min-h-screen bg-black">
        {isInConversation ? (
          <div className="h-screen w-full">
            <SimpleVoiceAssistant />
          </div>
        ) : isConnecting || isDisconnecting ? (
          <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="text-center">
              <LoadingSpinner size="lg" color="white" />
              <h2 className="text-xl font-semibold text-white mt-4 mb-2">
                {isDisconnecting ? 'Disconnecting from Voice Agent' : 'Connecting to Voice Agent'}
              </h2>
              <p className="text-white/60">
                {isDisconnecting 
                  ? 'Ending conversation...' 
                  : (project?.project_data?.public_title || project?.name)
                }
              </p>
            </div>
          </div>
        ) : hasManuallyDisconnected ? (
          <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="text-center">
              <LoadingSpinner size="lg" color="white" />
              <h2 className="text-xl font-semibold text-white mt-4 mb-2">Redirecting...</h2>
              <p className="text-white/60">
                Returning to community page...
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