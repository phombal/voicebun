'use client'

import { useEffect, useRef } from 'react';
import TranscriptionView from './TranscriptionView';
import { useDatabase } from '@/hooks/useDatabase';

export default function DatabaseTranscriptionView() {
  const { currentSession, addChatMessage } = useDatabase();
  const lastProcessedMessageRef = useRef<string>('');

  useEffect(() => {
    // Listen for transcription updates and save to database
    const handleTranscriptionUpdate = async () => {
      if (!currentSession) return;

      // Get the transcription container
      const transcriptionContainer = document.querySelector('[data-lk-theme="default"] .lk-transcription');
      if (!transcriptionContainer) return;

      // Get all message elements
      const messageElements = Array.from(transcriptionContainer.querySelectorAll('.lk-transcription-item'));
      
      for (const messageElement of messageElements) {
        const messageText = messageElement.textContent?.trim();
        const isAssistant = messageElement.classList.contains('lk-transcription-item-assistant') || 
                           messageElement.querySelector('.lk-participant-name')?.textContent?.toLowerCase().includes('agent');
        
        if (messageText && messageText !== lastProcessedMessageRef.current) {
          try {
            await addChatMessage(
              currentSession.id,
              isAssistant ? 'assistant' : 'user',
              messageText,
              false
            );
            
            lastProcessedMessageRef.current = messageText;
            console.log('💾 Saved message to database:', { 
              role: isAssistant ? 'assistant' : 'user', 
              content: messageText.substring(0, 50) + '...' 
            });
          } catch (error) {
            console.error('❌ Failed to save message to database:', error);
          }
        }
      }
    };

    // Set up a mutation observer to watch for new transcription messages
    const observer = new MutationObserver(handleTranscriptionUpdate);
    
    // Start observing when the component mounts
    const startObserving = () => {
      const transcriptionContainer = document.querySelector('[data-lk-theme="default"]');
      if (transcriptionContainer) {
        observer.observe(transcriptionContainer, {
          childList: true,
          subtree: true,
          characterData: true
        });
      }
    };

    // Start observing immediately if the container exists, otherwise wait a bit
    startObserving();
    const timeoutId = setTimeout(startObserving, 1000);

    return () => {
      observer.disconnect();
      clearTimeout(timeoutId);
    };
  }, [currentSession, addChatMessage]);

  return <TranscriptionView />;
} 