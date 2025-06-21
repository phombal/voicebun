import { useState, useRef, useEffect } from 'react';
import { LoadingSpinner } from './LoadingBun';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  checkpoint?: boolean;
  filesSnapshot?: Map<string, string>;
  isError?: boolean;
}

interface ChatPanelProps {
  isExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  messages: ChatMessage[];
  inputMessage: string;
  onInputChange: (message: string) => void;
  onSendMessage: () => void;
  isGenerating: boolean;
  onBackToHome?: () => void;
}

export function ChatPanel({
  isExpanded,
  onExpandedChange,
  messages,
  inputMessage,
  onInputChange,
  onSendMessage,
  isGenerating,
  onBackToHome
}: ChatPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [textareaHeight, setTextareaHeight] = useState(24); // Track textarea height

  // Auto-resize textarea on mount and when input changes
  useEffect(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.style.height = 'auto';
      const lineHeight = 24;
      const maxLines = 10;
      const maxHeight = lineHeight * maxLines;
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      const finalHeight = Math.max(newHeight, 24);
      textarea.style.height = finalHeight + 'px';
      setTextareaHeight(finalHeight); // Update state to resize container
    }
  }, [inputMessage]);

  // Prevent scroll propagation to parent elements
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  // Prevent wheel events from propagating to parent when scrolling at boundaries
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const { scrollTop, scrollHeight, clientHeight } = target;
    
    // If scrolling up and already at top, or scrolling down and already at bottom
    const isAtTop = scrollTop === 0;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;
    
    if ((e.deltaY < 0 && isAtTop) || (e.deltaY > 0 && isAtBottom)) {
      // Still at boundary, but don't prevent default to allow some natural feel
      // Just stop propagation to parent
      e.stopPropagation();
    } else {
      // Normal scrolling within bounds
      e.stopPropagation();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onInputChange(e.target.value);
    
    // Auto-resize textarea
    const textarea = e.target;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      
      // Calculate the number of lines based on scrollHeight
      const lineHeight = 24; // Approximate line height in pixels
      const maxLines = 10;
      const maxHeight = lineHeight * maxLines;
      
      // Set the height based on content, but cap it at maxHeight
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      const finalHeight = Math.max(newHeight, 24);
      textarea.style.height = finalHeight + 'px';
      setTextareaHeight(finalHeight); // Update state to resize container
    }
  };

  const handleKeyDownInInput = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  };

  const handleSendMessage = () => {
    onSendMessage();
    
    // Reset textarea height to minimum
    if (textareaRef.current) {
      textareaRef.current.style.height = '24px';
      setTextareaHeight(24); // Reset container height state
    }
  };

  return (
    <div className="w-full h-full bg-black flex flex-col" style={{ scrollBehavior: 'auto' }}>
      {/* Chat History */}
      <div 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent bg-black min-h-0 smooth-scroll"
        onScroll={handleScroll}
        onWheel={handleWheel}
        style={{ 
          scrollBehavior: 'auto',
          overscrollBehavior: 'contain',
          isolation: 'isolate'
        }}
      >
        {messages.map((message) => (
          <div key={message.id} className="flex flex-col items-start">
            {message.role === 'assistant' ? (
              <div className="mb-2">
                <p className="text-sm font-black text-white" style={{ fontWeight: '900', fontFamily: 'Helvetica, "Helvetica Neue", Arial, sans-serif' }}>Bun</p>
              </div>
            ) : (
              <div className="mb-2">
                <p className="text-sm font-black text-white" style={{ fontWeight: '900', fontFamily: 'Helvetica, "Helvetica Neue", Arial, sans-serif' }}>You</p>
              </div>
            )}
            <div className="max-w-[95%]">
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-white/90">{message.content}</p>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs opacity-70 text-white/70">
                  {message.timestamp.toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: false 
                  })}
                </p>
              </div>
            </div>
          </div>
        ))}
        {isGenerating && (
          <div className="flex flex-col items-start">
            <div className="mb-2">
              <p className="text-sm font-black text-white" style={{ fontWeight: '900', fontFamily: 'Helvetica, "Helvetica Neue", Arial, sans-serif' }}>Bun</p>
            </div>
            <div className="max-w-[95%]">
              <div className="flex items-center space-x-3">
                <LoadingSpinner size="lg" color="blue" className="mr-2" />
                <span className="text-sm text-white/90">Thinking...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat Input - Sticky at bottom of sidebar */}
      <div 
        className="flex-shrink-0 bg-gray-800 rounded-3xl shadow-2xl shadow-black/50 m-4 mb-8 transition-all duration-200 ease-out"
        style={{
          minHeight: `${24 + 48}px`, // 24px textarea + 48px padding (24px top + 24px bottom)
          height: `${textareaHeight + 48}px` // Dynamic height based on textarea
        }}
      >
        <div className="p-6 h-full flex items-center">
          <div className="flex items-start space-x-3 w-full">
            <div className="flex-1">
              <textarea
                ref={textareaRef}
                value={inputMessage}
                onChange={handleInputChange}
                onKeyDown={handleKeyDownInInput}
                placeholder="Ask Bun to modify your code..."
                className="w-full bg-transparent text-white placeholder-white/50 resize-none outline-none text-sm leading-relaxed overflow-y-auto"
                rows={1}
                style={{
                  minHeight: '24px',
                  maxHeight: '240px', // 10 lines * 24px line height
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(255, 255, 255, 0.3) transparent',
                  lineHeight: '24px',
                  padding: '0',
                  margin: '0',
                  border: 'none',
                  boxShadow: 'none'
                }}
              />
            </div>
            
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isGenerating}
              className="w-8 h-8 bg-white hover:bg-gray-100 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-colors flex-shrink-0 mt-0"
            >
              <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 