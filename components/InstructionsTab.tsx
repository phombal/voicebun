import React from 'react';

interface InstructionsTabProps {
  projectConfig: {
    systemPrompt: string;
    publicWelcomeMessage: string;
    firstMessageMode: 'wait' | 'speak_first' | 'speak_first_with_model_generated_message';
    [key: string]: any; // Allow other properties from the full config
  };
  setProjectConfig: React.Dispatch<React.SetStateAction<any>>;
}

export function InstructionsTab({ projectConfig, setProjectConfig }: InstructionsTabProps) {
  return (
    <div className="h-full bg-black p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* System Prompt Section */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
          <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
            <svg className="w-6 h-6 mr-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            System Prompt
          </h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-white/70">
                Define your agent's behavior and personality
              </label>
            </div>
            
            <textarea 
              rows={8}
              value={projectConfig.systemPrompt}
              onChange={(e) => setProjectConfig((prev: any) => ({ ...prev, systemPrompt: e.target.value }))}
              className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 resize-none"
              placeholder="Enter your system prompt here. For example: 'You are a helpful customer service representative for an e-commerce company. You should be friendly, professional, and knowledgeable about products and policies. Always aim to resolve customer issues efficiently while maintaining a positive tone.'"
            />
          </div>
        </div>
        
        {/* Welcome Message Section */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
          <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
            <svg className="w-6 h-6 mr-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            Welcome Message
          </h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-white/70">
                First message users will hear when they call
              </label>
            </div>

            <textarea 
              rows={3}
              value={projectConfig.publicWelcomeMessage}
              onChange={(e) => setProjectConfig((prev: any) => ({ ...prev, publicWelcomeMessage: e.target.value }))}
              className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 resize-none"
              placeholder="Hello! I'm here to help you with..."
            />
            
            {/* Assistant Speaks First Toggle */}
            <div className="flex items-center justify-between p-4 bg-white/5 border border-white/20 rounded-lg">
              <div className="flex flex-col">
                <label className="text-sm font-medium text-white">
                  Assistant speaks first
                </label>
                <span className="text-xs text-white/60 mt-1">
                  When enabled, the assistant will greet users immediately when they call
                </span>
              </div>
              <button
                type="button"
                onClick={() => setProjectConfig((prev: any) => ({ 
                  ...prev, 
                  firstMessageMode: prev.firstMessageMode === 'wait' ? 'speak_first' : 'wait'
                }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  projectConfig.firstMessageMode !== 'wait' 
                    ? 'bg-green-600' 
                    : 'bg-white/20'
                }`}
                aria-pressed={projectConfig.firstMessageMode !== 'wait'}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    projectConfig.firstMessageMode !== 'wait' 
                      ? 'translate-x-6' 
                      : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 