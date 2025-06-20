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
              <div class="text-sm opacity-90">Your voice "${voiceName}" has been successfully cloned and is now available for selection.</div>
            </div>
          </div>
        `;
        notification.className = 'fixed bottom-4 right-4 bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-sm';
        document.body.appendChild(notification);

        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
        }, 5000);

        // Reset the form
        setVoiceName('');
        setRecordedAudio(null);
        setRecordingDuration(0);

        // Notify parent to refresh custom voices
        if (onVoiceCloned) {
          onVoiceCloned();
        }

        // Close the modal
        handleClose();

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className="bg-gray-900 rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl border border-white/20">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-2">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <h3 className="text-xl font-semibold text-white">Clone New Voice</h3>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-6">
          <div className="p-4 bg-blue-600/20 border border-blue-600/30 rounded-xl">
            <h4 className="text-white font-medium mb-2">Sample Text to Read:</h4>
            <p className="text-white/90 text-sm leading-relaxed">
              "Welcome to VoiceBun, the innovative platform that transforms how we interact with artificial intelligence through natural voice conversations. Our advanced technology creates seamless communication experiences that feel authentic and engaging. By recording this sample, you're helping us capture the unique characteristics of your voice to create a personalized clone that will represent you in future interactions."
            </p>
          </div>

          {!recordedAudio ? (
            <div className="space-y-4">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="w-full px-6 py-4 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  <span>Start Recording</span>
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-center space-x-4 p-6 bg-red-600/20 border border-red-600/30 rounded-xl">
                    <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-white font-medium">Recording...</span>
                    <span className="text-white/70 font-mono">{formatDuration(recordingDuration)}</span>
                  </div>
                  <button
                    onClick={stopRecording}
                    className="w-full px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-xl transition-colors"
                  >
                    Stop Recording
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-green-600/20 border border-green-600/30 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-white font-medium">Recording Complete</span>
                    <span className="text-white/70 text-sm">({formatDuration(recordingDuration)})</span>
                  </div>
                  <button
                    onClick={clearRecording}
                    className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={handlePlayPause}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center space-x-2"
                >
                  {isPlaying ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m-5-4v4" />
                    </svg>
                  )}
                  <span>{isPlaying ? 'Pause' : 'Play'}</span>
                </button>
              </div>
              
              {/* Voice Clone Form */}
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-white/70 text-sm font-medium mb-2">
                    Voice Name
                  </label>
                  <input
                    type="text"
                    value={voiceName}
                    onChange={(e) => setVoiceName(e.target.value)}
                    placeholder="Enter a name for your voice clone"
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div className="flex space-x-3">
                  <button
                    onClick={handleClose}
                    className="flex-1 px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCloneVoice}
                    disabled={isCloning || !voiceName.trim() || !recordedAudio}
                    className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium rounded-xl transition-colors flex items-center justify-center space-x-2"
                  >
                    {isCloning && (
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                    <span>{isCloning ? 'Creating...' : 'Create Voice Clone'}</span>
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