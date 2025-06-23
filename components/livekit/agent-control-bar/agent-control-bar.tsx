import React from 'react';
import { Mic, MicOff, Phone } from 'lucide-react';
import { Room } from 'livekit-client';

interface Capabilities {
  chat: boolean;
  microphone: boolean;
  camera: boolean;
  screenshare: boolean;
}

interface AgentControlBarProps {
  capabilities: Capabilities;
  onChatOpenChange: (open: boolean) => void;
  onSendMessage: (message: string) => void;
  room?: Room;
  onEndCall?: () => void;
}

export function AgentControlBar({ 
  capabilities, 
  room,
  onEndCall
}: Omit<AgentControlBarProps, 'onChatOpenChange' | 'onSendMessage'>) {
  const [isMuted, setIsMuted] = React.useState(false);

  const handleMuteToggle = async () => {
    if (room) {
      try {
        const newMutedState = !isMuted;
        await room.localParticipant.setMicrophoneEnabled(!newMutedState);
        setIsMuted(newMutedState);
      } catch (error) {
        console.error('Failed to toggle microphone:', error);
      }
    }
  };

  const handleEndCall = async () => {
    if (onEndCall) {
      onEndCall();
    } else if (room) {
      try {
        await room.disconnect();
      } catch (error) {
        console.error('Error disconnecting from room:', error);
      }
    }
  };

  return (
    <div className="flex items-center justify-center gap-4 p-4 bg-black/50 backdrop-blur-sm rounded-xl border border-white/20">
      {/* Microphone Button */}
      {capabilities.microphone && (
        <button
          onClick={handleMuteToggle}
          className={`
            w-12 h-12 rounded-full border-2 transition-all duration-200 flex items-center justify-center
            ${isMuted 
              ? 'bg-red-500 border-red-500 hover:bg-red-600 hover:border-red-600' 
              : 'bg-white/10 border-white/20 hover:bg-white/20 hover:border-white/30'
            }
          `}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? (
            <MicOff className="w-5 h-5 text-white" />
          ) : (
            <Mic className="w-5 h-5 text-white" />
          )}
        </button>
      )}

      {/* End Call Button */}
      <button
        onClick={handleEndCall}
        className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 border-2 border-red-500 hover:border-red-600 transition-all duration-200 flex items-center justify-center group"
        title="End Call"
      >
        <Phone className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
      </button>
    </div>
  );
} 