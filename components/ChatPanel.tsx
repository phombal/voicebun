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
  functions?: any[]; // Add functions to message type
  isGeneratingFunctions?: boolean;
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
  projectId?: string; // Add projectId prop
  onFunctionsGenerated?: (functions: any[]) => void; // Add callback for function generation
}

export function ChatPanel({
  messages,
  inputMessage,
  onInputChange,
  onSendMessage,
  isGenerating,
  projectId,
  onFunctionsGenerated
}: Omit<ChatPanelProps, 'isExpanded' | 'onExpandedChange' | 'onBackToHome'>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [textareaHeight, setTextareaHeight] = useState(24); // Track textarea height
  const [isGeneratingFunctions, setIsGeneratingFunctions] = useState(false);

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

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Function to detect if user wants to create functions
  const detectFunctionRequest = (message: string): boolean => {
    const functionKeywords = [
      'create function', 'add function', 'make function', 'build function',
      'generate function', 'function for', 'need function', 'function to',
      'integrate', 'connect to', 'api for', 'webhook', 'automation',
      'schedule meeting', 'send email', 'hangup', 'voicemail', 'sms',
      'spreadsheet', 'calendar', 'booking', 'ticket', 'log data',
      'workiz', 'zapier', 'salesforce', 'hubspot', 'monday.com'
    ];
    
    const lowerMessage = message.toLowerCase();
    const detected = functionKeywords.some(keyword => lowerMessage.includes(keyword));
    
    // Add debugging
    console.log('🔍 Function detection:', {
      message: lowerMessage,
      detected,
      matchingKeywords: functionKeywords.filter(keyword => lowerMessage.includes(keyword))
    });
    
    return detected;
  };

  // Generate functions using AI
  const generateFunctions = async (prompt: string) => {
    if (!projectId) {
      console.error('Project ID is required for function generation');
      return;
    }

    setIsGeneratingFunctions(true);
    
    try {
      const response = await fetch('/api/generate-function', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          projectId
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate functions');
      }

      const result = await response.json();
      
      // Check if this is a documentation request
      if (result.request_documentation) {
        console.log('📚 Documentation request received:', result.service);
        
        // Create a message requesting documentation
        const docRequestMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `${result.message}\n\n**Please provide:**\n- API endpoint URLs\n- Authentication methods (API keys, OAuth, etc.)\n- Request/response examples\n- Required and optional parameters\n\nOnce you provide the documentation, I'll generate accurate function configurations for ${result.service}.`,
          timestamp: new Date(),
        };

        // Note: ChatPanel doesn't directly manage messages, so we'd need a callback
        // For now, log this - the parent component should handle message updates
        console.log('Would add documentation request message:', docRequestMessage);
        return null;
      }
      
      const { functions, message } = result;
      
      // Create a new message with the generated functions
      const functionMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: message + '\n\nI\'ve generated the following function(s) for you:',
        timestamp: new Date(),
        functions: functions
      };

      // Add the message via parent component if available
      if (onFunctionsGenerated) {
        onFunctionsGenerated(functions);
      }

      return functions;
    } catch (error) {
      console.error('Error generating functions:', error);
      // Create error message
      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Sorry, I couldn't generate functions for your request. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        isError: true
      };
      return null;
    } finally {
      setIsGeneratingFunctions(false);
    }
  };

  // Enhanced send message handler
  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    console.log('📨 Handling message:', inputMessage);

    // Check if this is a function generation request
    if (detectFunctionRequest(inputMessage)) {
      console.log('✅ Function generation triggered');
      await generateFunctions(inputMessage);
    } else {
      console.log('❌ Function generation NOT triggered, going to regular chat');
    }
    
    // Call the original send message handler
    onSendMessage();
  };

  // Handle adding generated functions to project
  const handleAddFunction = (functionToAdd: any) => {
    if (onFunctionsGenerated) {
      onFunctionsGenerated([functionToAdd]);
    }
  };

  // Handle adding all generated functions
  const handleAddAllFunctions = (functions: any[]) => {
    if (onFunctionsGenerated) {
      onFunctionsGenerated(functions);
    }
  };

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
      handleSendMessage();
    }
  };

  const handleSendMessageClick = () => {
    handleSendMessage();
    
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
            <div className="max-w-[95%] w-full">
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-white/90">{message.content}</p>
              
              {/* Display generated functions */}
              {message.functions && message.functions.length > 0 && (
                <div className="mt-4 space-y-3">
                  {message.functions.map((func, index) => (
                    <div key={index} className="bg-white/5 rounded-lg border border-white/20 p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="text-white font-medium text-lg mb-1">{func.name}</h4>
                          <p className="text-white/70 text-sm mb-2">{func.description}</p>
                          
                          {/* Function details */}
                          <div className="space-y-2 text-xs">
                            {func.url && (
                              <div>
                                <span className="text-white/50">URL:</span>
                                <span className="text-blue-300 ml-2 font-mono">{func.url}</span>
                              </div>
                            )}
                            {func.parameters?.properties && Object.keys(func.parameters.properties).length > 0 && (
                              <div>
                                <span className="text-white/50">Parameters:</span>
                                <span className="text-green-300 ml-2">
                                  {Object.keys(func.parameters.properties).join(', ')}
                                </span>
                              </div>
                            )}
                            {func.parameters?.required && func.parameters.required.length > 0 && (
                              <div>
                                <span className="text-white/50">Required:</span>
                                <span className="text-yellow-300 ml-2">
                                  {func.parameters.required.join(', ')}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Add function button */}
                        <button
                          onClick={() => handleAddFunction(func)}
                          className="ml-4 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-md transition-colors flex items-center space-x-1"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          <span>Add</span>
                        </button>
                      </div>
                      
                      {/* Function preview */}
                      <details className="mt-3">
                        <summary className="text-white/50 text-xs cursor-pointer hover:text-white/70">
                          View Configuration
                        </summary>
                        <div className="mt-2 p-3 bg-black/30 rounded border border-white/10">
                          <pre className="text-xs text-white/70 font-mono overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(func, null, 2)}
                          </pre>
                        </div>
                      </details>
                    </div>
                  ))}
                  
                  {/* Add all functions button */}
                  {message.functions.length > 1 && (
                    <div className="flex justify-center pt-2">
                      <button
                        onClick={() => handleAddAllFunctions(message.functions!)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors flex items-center space-x-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Add All {message.functions.length} Functions</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
              
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
        {(isGenerating || isGeneratingFunctions) && (
          <div className="flex flex-col items-start">
            <div className="mb-2">
              <p className="text-sm font-black text-white" style={{ fontWeight: '900', fontFamily: 'Helvetica, "Helvetica Neue", Arial, sans-serif' }}>Bun</p>
            </div>
            <div className="max-w-[95%]">
              <div className="flex items-center space-x-3">
                <LoadingSpinner size="lg" color="blue" className="mr-2" />
                <span className="text-sm text-white/90">
                  {isGeneratingFunctions ? 'Generating functions...' : 'Thinking...'}
                </span>
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
                placeholder="Ask Bun to modify your code or create functions..."
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
              onClick={handleSendMessageClick}
              disabled={!inputMessage.trim() || isGenerating || isGeneratingFunctions}
              className="w-8 h-8 bg-white hover:bg-gray-100 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-colors flex-shrink-0 mt-0"
            >
              <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Function generation hint */}
      {detectFunctionRequest(inputMessage) && inputMessage.trim() && (
        <div className="mx-4 mb-2 p-2 bg-blue-900/20 border border-blue-500/30 rounded-lg">
          <div className="flex items-center space-x-2 text-blue-300 text-xs">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>I'll generate functions for your request!</span>
          </div>
        </div>
      )}
    </div>
  );
} 