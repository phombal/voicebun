import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from "framer-motion";
import { Room, RoomEvent } from "livekit-client";
import {
  BarVisualizer,
  DisconnectButton,
  RoomAudioRenderer,
  RoomContext,
  VideoTrack,
  VoiceAssistantControlBar,
  useVoiceAssistant,
} from "@livekit/components-react";
import TranscriptionView from "./TranscriptionView";
import { CloseIcon } from "./CloseIcon";
import { type VoiceAgentConfig } from './VoiceAgentConfig';
import { Project } from '@/lib/database/types';
import { VideoPresets } from "livekit-client";

interface VoiceConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: VoiceAgentConfig;
  project: Project | null;
  currentProject: Project | null;
  projectConfig: {
    systemPrompt: string;
    llmProvider: string;
    llmModel: string;
    llmTemperature: number;
    llmMaxResponseLength: number;
    sttProvider: string;
    sttLanguage: string;
    sttQuality: string;
    sttProcessingMode: string;
    sttNoiseSuppression: boolean;
    sttAutoPunctuation: boolean;
    ttsProvider: string;
    ttsVoice: string;
    firstMessageMode: string;
    responseLatencyPriority: string;
  };
  user: any;
  createProject?: (name: string, description: string, prompt: string, config: VoiceAgentConfig, code: string) => Promise<Project>;
  code: string;
}

export function VoiceConversationModal({
  isOpen,
  onClose,
  config,
  project,
  currentProject,
  projectConfig,
  user,
  createProject,
  code
}: VoiceConversationModalProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isInConversation, setIsInConversation] = useState(false);
  const [hasStartedConversation, setHasStartedConversation] = useState(false);

  // Room state
  const [room] = useState(() =>
    new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: VideoPresets.h540.resolution,
      },
    }),
  );

  const startConversation = useCallback(async () => {
    console.log('🔥 CLICKED START CONVERSATION BUTTON!');
    console.log('🔍 Initial state check:');
    console.log('   • isConnecting:', isConnecting);
    console.log('   • isInConversation:', isInConversation);
    console.log('   • currentProject:', currentProject?.id || 'NONE');
    console.log('   • config:', config);
    console.log('   • room:', room);
    
    setIsConnecting(true);
    console.log('⏳ Set isConnecting = true');
    
    try {
      console.log('🚀 Starting conversation process...');
      
      // IMMEDIATELY set conversation state to prevent any navigation
      setIsInConversation(true);
      console.log('🎯 Set isInConversation = true');

      // Ensure project exists - prioritize prop over currentProject
      let projectToUse = project || currentProject;
      console.log('📦 Checking project status:');
      console.log('   • project prop:', project?.id || 'NONE');
      console.log('   • currentProject:', currentProject?.id || 'NONE');
      console.log('   • projectToUse:', projectToUse?.id || 'NONE');
      console.log('   • createProject function:', typeof createProject);
      
      if (!projectToUse && createProject) {
        console.log('📦 Creating project before starting conversation...');
        console.log('   • Using config.prompt:', config.prompt?.substring(0, 100) + '...');
        
        try {
          projectToUse = await createProject(
            `Voice Agent - ${config.prompt.substring(0, 50)}${config.prompt.length > 50 ? '...' : ''}`,
            `Generated voice agent based on: ${config.prompt}`,
            config.prompt,
            config,
            code
          );
          console.log('✅ Project created for conversation:', projectToUse?.id);
        } catch (createError) {
          console.error('❌ Failed to create project:', createError);
          throw new Error(`Failed to create project: ${createError instanceof Error ? createError.message : 'Unknown error'}`);
        }
      }

      if (!projectToUse) {
        console.error('❌ No project available - current:', currentProject, 'created:', projectToUse);
        throw new Error('No project available for conversation');
      }

      console.log('✅ Using project:', projectToUse.id);

      // Generate room connection details with project ID
      const endpoint = process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? "/api/connection-details";
      const url = new URL(endpoint, window.location.origin);
      url.searchParams.set('projectId', projectToUse.id);
      
      console.log('📡 Fetching connection details:');
      console.log('   • URL:', url.toString());
      console.log('   • Endpoint:', endpoint);
      console.log('   • Project ID:', projectToUse.id);
      
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

      console.log('📋 Agent dispatch metadata:');
      console.log('   • Project ID:', projectToUse.id);
      console.log('   • User ID:', user?.id);
      console.log('   • System Prompt Source:', projectConfig.systemPrompt ? 'AI-generated' : 'User input');
      console.log('   • System Prompt Length:', (projectConfig.systemPrompt || config.prompt).length, 'characters');
      console.log('   • LLM Provider/Model:', `${projectConfig.llmProvider}/${projectConfig.llmModel}`);
      console.log('   • STT Provider/Language:', `${projectConfig.sttProvider}/${projectConfig.sttLanguage}`);
      console.log('   • TTS Provider/Voice:', `${projectConfig.ttsProvider}/${projectConfig.ttsVoice}`);
      
      try {
        const dispatchResponse = await fetch('/api/agent-dispatch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            roomName: connectionDetailsData.roomName,
            agentName: 'voice-agent',
            projectId: projectToUse.id,
            userId: user?.id,
            metadata: {
              projectId: projectToUse.id,
              userId: user?.id,
              timestamp: new Date().toISOString()
            }
          }),
        });

        if (!dispatchResponse.ok) {
          const dispatchError = await dispatchResponse.json();
          throw new Error(`Failed to create agent dispatch: ${dispatchError.error || 'Unknown error'}`);
        }

        const dispatchResult = await dispatchResponse.json();
        console.log('✅ Agent dispatch created successfully:', dispatchResult);
      } catch (dispatchError) {
        console.error('❌ Failed to create agent dispatch:', dispatchError);
        // Don't throw here - we can still try to connect and the agent might pick up from room metadata
        console.log('⚠️ Continuing with room connection anyway...');
      }

      // Connect to room
      console.log('🔌 Connecting to LiveKit room...');
      console.log('   • Room state before connect:', room.state);
      console.log('   • Server URL:', connectionDetailsData.serverUrl);
      console.log('   • Token length:', connectionDetailsData.participantToken?.length);
      console.log('   • Room name:', connectionDetailsData.roomName);
      
      try {
        await room.connect(connectionDetailsData.serverUrl, connectionDetailsData.participantToken);
        console.log('✅ Connected to room successfully');
        console.log('   • Room state after connect:', room.state);
        console.log('   • Room participants:', room.remoteParticipants.size);
        console.log('   • Local participant:', room.localParticipant.identity);
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
      
      console.log('🎉 Voice conversation setup complete!');
      console.log('   • Project ID:', currentProject?.id);
      console.log('   • Room state:', room.state);
      console.log('   • isInConversation:', true);
      
    } catch (error) {
      console.error('❌ CONVERSATION START FAILED:');
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
  }, [isConnecting, isInConversation, currentProject, config, project, projectConfig, user, createProject, code, room]);

  const endConversation = async () => {
    await room.disconnect();
    setIsInConversation(false);
    onClose();
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

  // Start conversation when modal opens
  useEffect(() => {
    if (isOpen && !isInConversation && !isConnecting && !hasStartedConversation) {
      console.log('🌐 Modal opened - starting conversation...');
      setHasStartedConversation(true);
      startConversation();
    }
  }, [isOpen, isInConversation, isConnecting, hasStartedConversation, startConversation]);

  // Close modal if not in conversation anymore (but only after we've attempted to start)
  useEffect(() => {
    if (!isInConversation && !isConnecting && isOpen && hasStartedConversation) {
      console.log('🔄 Conversation ended - closing modal...');
      onClose();
    }
  }, [isInConversation, isConnecting, isOpen, onClose, hasStartedConversation]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setHasStartedConversation(false);
      setIsConnecting(false);
      setIsInConversation(false);
    }
  }, [isOpen]);

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
              style={{
                '--lk-va-bar-width': '72px',
                '--lk-control-bar-height': 'unset'
              } as React.CSSProperties}
            >
              <VoiceAssistantControlBar controls={{ leave: false }} />
              <DisconnectButton 
                onClick={endConversation}
              >
                <CloseIcon />
              </DisconnectButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (!isOpen) {
    return null;
  }

  return (
    <RoomContext.Provider value={room}>
      <style jsx global>{`
        .agent-visualizer .lk-audio-visualizer-bar {
          background-color: #000000 !important;
        }
        .agent-visualizer .lk-audio-visualizer-bar.lk-audio-visualizer-bar-active {
          background-color: rgba(255, 255, 255, 0.8) !important;
        }
        .lk-audio-visualizer {
          background-color: #000000 !important;
        }
        .agent-visualizer {
          background-color: #000000 !important;
        }
        .agent-visualizer > div {
          background-color: #000000 !important;
        }
        /* Ensure all nested elements have black background */
        .agent-visualizer * {
          background-color: transparent !important;
        }
        .agent-visualizer .lk-audio-visualizer {
          background-color: #000000 !important;
        }
        /* Hide any text in the voice assistant control bar */
        .lk-voice-assistant-control-bar span,
        .lk-voice-assistant-control-bar p,
        .lk-voice-assistant-control-bar div:not([class*="button"]):not([class*="control"]) {
          display: none !important;
        }
        /* Hide text content in LiveKit control elements */
        [data-lk-theme] .lk-voice-assistant-control-bar .lk-button-group span,
        [data-lk-theme] .lk-voice-assistant-control-bar .lk-button-group p,
        [data-lk-theme] .lk-voice-assistant-control-bar .lk-button-group div:not([class*="button"]):not([class*="icon"]) {
          display: none !important;
        }
        /* More specific targeting for LiveKit text elements */
        [data-lk-theme] .lk-voice-assistant-control-bar *:not(button):not(svg):not(path) {
          font-size: 0 !important;
          text-indent: -9999px !important;
        }
      `}</style>
      
      {/* Voice Assistant Overlay */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 flex items-center justify-center p-2 sm:p-4">
        <div className="pointer-events-auto w-full max-w-sm sm:max-w-2xl max-h-[85vh] sm:max-h-[90vh] overflow-hidden">
          <div className="bg-black/90 backdrop-blur-sm rounded-xl sm:rounded-2xl border border-white/20 relative h-full flex flex-col">
            {/* Mobile-friendly Header */}
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-white/20 flex-shrink-0">
              <h3 className="text-base sm:text-lg font-semibold text-white flex items-center">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                <span className="hidden sm:inline">Voice Agent Test</span>
                <span className="sm:hidden">Voice Test</span>
              </h3>
              <button
                onClick={endConversation}
                className="w-7 h-7 sm:w-8 sm:h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors group"
                title="End conversation"
              >
                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-white/70 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-6">
              <div className="space-y-3 sm:space-y-6">
                {/* Agent Visualizer - Reduced size for mobile */}
                <div className="flex justify-center">
                  <div className="w-full max-w-xs sm:max-w-md">
                    <AgentVisualizer />
                  </div>
                </div>
                
                {/* Live Transcription */}
                <div className="w-full">
                  <div className="bg-black rounded-lg p-2 sm:p-4 border border-white/20">
                    <h4 className="text-white font-medium mb-2 sm:mb-3 flex items-center justify-center text-xs sm:text-base">
                      <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                      </svg>
                      Live Transcription
                    </h4>
                    <div className="max-h-24 sm:max-h-40 overflow-y-auto text-sm sm:text-base">
                      <TranscriptionView />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Controls Footer */}
            <div className="border-t border-white/20 p-2 sm:p-4 flex-shrink-0">
              <div className="space-y-2 sm:space-y-3">
                <ConversationControlBar />
                <RoomAudioRenderer />
              </div>
            </div>
          </div>
        </div>
      </div>
    </RoomContext.Provider>
  );
} 