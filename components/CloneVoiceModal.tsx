import React, { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface CloneVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVoiceCloned?: () => void; // Callback to refresh custom voices list
  projectId?: string;
}

export function CloneVoiceModal({
  isOpen,
  onClose,
  onVoiceCloned,
  projectId
}: CloneVoiceModalProps) {
  // Internal state for voice cloning
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingTimer, setRecordingTimer] = useState<NodeJS.Timeout | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [voiceName, setVoiceName] = useState('');
  const [isCloning, setIsCloning] = useState(false);

  const { user } = useAuth();

  // Audio recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      let mimeType = 'audio/webm';
      
      if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/wav')) {
        mimeType = 'audio/wav';
      }
      
      const recorder = new MediaRecorder(stream, { 
        mimeType: mimeType,
        audioBitsPerSecond: 128000
      });
      
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        setRecordedAudio(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingDuration(0);

      const timer = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      setRecordingTimer(timer);

    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Unable to access microphone. Please check your permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
      
      if (recordingTimer) {
        clearInterval(recordingTimer);
        setRecordingTimer(null);
      }
    }
  };

  const clearRecording = () => {
    setRecordedAudio(null);
    setRecordingDuration(0);
    if (currentAudio) {
      currentAudio.pause();
      setIsPlaying(false);
      setCurrentAudio(null);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    if (!recordedAudio) return;

    if (isPlaying && currentAudio) {
      currentAudio.pause();
      setIsPlaying(false);
    } else {
      const audio = new Audio(URL.createObjectURL(recordedAudio));
      setCurrentAudio(audio);
      setIsPlaying(true);
      
      audio.onended = () => {
        setIsPlaying(false);
        setCurrentAudio(null);
      };
      
      audio.onerror = () => {
        setIsPlaying(false);
        setCurrentAudio(null);
      };
      
      audio.play();
    }
  };

  const handleCloneVoice = async () => {
    if (!recordedAudio || !voiceName.trim()) return;

    setIsCloning(true);
    try {
      const formData = new FormData();
      formData.append('audioFile', recordedAudio, 'voice-recording.mp3');
      formData.append('voiceName', voiceName.trim());
      formData.append('userEmail', user?.email || 'unknown@example.com');
      formData.append('userName', user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Unknown User');
      if (projectId) {
        formData.append('projectId', projectId);
      }

      const response = await fetch('/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        const notification = document.createElement('div');
        notification.innerHTML = `
          <div class="flex items-center space-x-3">
            <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <div>
              <div class="font-medium">Voice Clone Created!</div>
              <div class="text-sm opacity-90">Your voice "${voiceName}" has been successfully cloned and is being saved...</div>
            </div>
          </div>
        `;
        notification.className = 'fixed bottom-4 right-4 bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-sm';
        document.body.appendChild(notification);

        // Store the voice ID for verification
        const newVoiceId = result.voiceId;
        console.log('🎵 Voice clone created with ID:', newVoiceId);

        // Reset the form
        setVoiceName('');
        setRecordedAudio(null);
        setRecordingDuration(0);

        // Notify parent to refresh custom voices and verify the voice was saved
        if (onVoiceCloned) {
          console.log('🔄 Refreshing custom voices after successful clone...');
          await onVoiceCloned();
          
          // Additional verification: wait a bit more to ensure database propagation
          console.log('⏳ Waiting for database propagation...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Trigger another refresh to be absolutely sure
          await onVoiceCloned();
          console.log('✅ Voice list refresh completed');
        }

        // Update notification to show completion
        if (document.body.contains(notification)) {
          notification.innerHTML = `
            <div class="flex items-center space-x-3">
              <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <div>
                <div class="font-medium">Voice Clone Ready!</div>
                <div class="text-sm opacity-90">Your voice "${voiceName}" is now available for selection.</div>
              </div>
            </div>
          `;
        }

        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
        }, 5000);

        // Close the modal after ensuring the voice is properly saved and refreshed
        setTimeout(() => {
          handleClose();
        }, 1000); // Reduced delay since we already waited above

      } else {
        const notification = document.createElement('div');
        notification.innerHTML = `
          <div class="flex items-center space-x-3">
            <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <div>
              <div class="font-medium">Voice Clone Failed</div>
              <div class="text-sm opacity-90">${result.error || 'Failed to create voice clone. Please try again.'}</div>
            </div>
          </div>
        `;
        notification.className = 'fixed bottom-4 right-4 bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-sm';
        document.body.appendChild(notification);

        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
        }, 8000);
      }
    } catch (error) {
      console.error('Voice cloning error:', error);
      
      const notification = document.createElement('div');
      notification.innerHTML = `
        <div class="flex items-center space-x-3">
          <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <div>
            <div class="font-medium">Voice Clone Error</div>
            <div class="text-sm opacity-90">An unexpected error occurred. Please try again.</div>
          </div>
        </div>
      `;
      notification.className = 'fixed bottom-4 right-4 bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-sm';
      document.body.appendChild(notification);

      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 8000);
    } finally {
      setIsCloning(false);
    }
  };

  const handleClose = () => {
    // Reset recording state when closing
    if (isRecording) {
      stopRecording();
    }
    clearRecording();
    setVoiceName('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className="bg-black border border-white/20 rounded-2xl p-4 md:p-8 max-w-xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4 md:mb-8">
          <div className="flex items-center space-x-2 md:space-x-3">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <svg className="w-4 h-4 md:w-5 md:h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <h3 className="text-lg md:text-2xl font-bold text-white">Clone New Voice</h3>
          </div>
          <button
            onClick={handleClose}
            className="text-white/60 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-4 md:space-y-8">
          {!recordedAudio && (
            <div className="rounded-xl p-3 md:p-6">
              <h4 className="text-white font-semibold mb-2 md:mb-4 flex items-center space-x-2 text-sm md:text-base">
                <svg className="w-4 h-4 md:w-5 md:h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <span>Sample Text to Read:</span>
              </h4>
              <div className="text-white/80 leading-relaxed text-sm md:text-base">
                "Welcome to VoiceBun, the innovative platform that transforms how we interact with artificial intelligence through natural voice conversations. Our advanced technology creates seamless communication experiences that feel authentic and engaging. By recording this sample, you're helping us capture the unique characteristics of your voice to create a personalized clone that will represent you in future interactions."
              </div>
            </div>
          )}

          {!recordedAudio ? (
            <div className="space-y-4 md:space-y-6">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="w-full px-6 py-3 md:px-8 md:py-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center space-x-3 group hover:scale-[1.02] min-h-[48px]"
                >
                  <div className="w-5 h-5 md:w-6 md:h-6 bg-white/20 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                  <span className="text-sm md:text-base">Start Recording</span>
                </button>
              ) : (
                <div className="space-y-4 md:space-y-6">
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 md:p-6">
                    <div className="flex items-center justify-center space-x-3 md:space-x-4">
                      <div className="w-3 h-3 md:w-4 md:h-4 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="text-white font-semibold text-sm md:text-lg">Recording...</span>
                      <div className="bg-black/50 px-2 py-1 md:px-3 md:py-1 rounded-lg">
                        <span className="text-white/90 font-mono text-xs md:text-sm">{formatDuration(recordingDuration)}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={stopRecording}
                    className="w-full px-6 py-3 md:px-8 md:py-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all duration-200 hover:scale-[1.02] min-h-[48px] text-sm md:text-base"
                  >
                    Stop Recording
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 md:space-y-6">
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 md:space-x-4">
                    <div className="w-6 h-6 md:w-8 md:h-8 bg-green-500/20 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 md:w-4 md:h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-white font-semibold text-sm md:text-base">Recording Complete</div>
                      <div className="text-white/60 text-xs md:text-sm">Duration: {formatDuration(recordingDuration)}</div>
                    </div>
                  </div>
                  <button
                    onClick={clearRecording}
                    className="px-3 py-2 md:px-4 md:py-2 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-xs md:text-sm font-medium rounded-lg transition-colors min-h-[40px]"
                  >
                    Clear
                  </button>
                </div>
              </div>
              
              <button
                onClick={handlePlayPause}
                className="w-full px-4 py-3 md:px-6 md:py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center space-x-3 hover:scale-[1.02] min-h-[48px]"
              >
                <div className="w-5 h-5 md:w-6 md:h-6 bg-white/20 rounded-full flex items-center justify-center">
                  {isPlaying ? (
                    <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3 md:w-4 md:h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </div>
                <span className="text-sm md:text-base">{isPlaying ? 'Pause Preview' : 'Play Preview'}</span>
              </button>
              
              {/* Voice Clone Form */}
              <div className="space-y-4 md:space-y-6">
                <div>
                  <label className="block text-white font-medium mb-2 md:mb-3 text-sm md:text-base">
                    Voice Name
                  </label>
                  <input
                    type="text"
                    value={voiceName}
                    onChange={(e) => setVoiceName(e.target.value)}
                    placeholder="Enter a name for your voice clone"
                    className="w-full px-3 py-2 md:px-4 md:py-3 bg-gray-900 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm md:text-base min-h-[44px]"
                  />
                </div>
                
                <div className="flex flex-col md:flex-row space-y-3 md:space-y-0 md:space-x-4">
                  <button
                    onClick={handleClose}
                    className="flex-1 px-4 py-3 md:px-6 md:py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all duration-200 hover:scale-[1.02] min-h-[48px] text-sm md:text-base"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCloneVoice}
                    disabled={isCloning || !voiceName.trim() || !recordedAudio}
                    className="flex-1 px-4 py-3 md:px-6 md:py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center space-x-2 hover:scale-[1.02] disabled:hover:scale-100 min-h-[48px] text-sm md:text-base"
                  >
                    {isCloning && (
                      <svg className="w-3 h-3 md:w-4 md:h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                    <span>{isCloning ? 'Creating Voice...' : 'Create Voice Clone'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 