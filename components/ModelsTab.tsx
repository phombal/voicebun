import React from 'react';

interface ModelsTabProps {
  projectConfig: {
    systemPrompt: string;
    agentInstructions: string;
    firstMessageMode: 'wait' | 'speak_first' | 'speak_first_with_model_generated_message';
    llmProvider: 'openai' | 'anthropic' | 'google' | 'azure' | 'xai';
    llmModel: string;
    llmTemperature: number;
    llmMaxResponseLength: 150 | 300 | 500 | 1000;
    sttProvider: 'deepgram';
    sttLanguage: 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ja' | 'ko' | 'zh';
    sttQuality: 'standard' | 'enhanced' | 'premium';
    sttProcessingMode: 'streaming' | 'batch';
    sttNoiseSuppression: boolean;
    sttAutoPunctuation: boolean;
    ttsProvider: 'cartesia' | 'openai' | 'clone_voice';
    ttsVoice: string;
    phoneNumber: string | null;
    phoneInboundEnabled: boolean;
    phoneOutboundEnabled: boolean;
    phoneRecordingEnabled: boolean;
    responseLatencyPriority: 'speed' | 'balanced' | 'quality';
    knowledgeBaseFiles: Array<{name: string; type: "pdf" | "txt" | "docx" | "csv" | "json"; content: string; size: number}>;
    functionsEnabled: boolean;
    customFunctions: Array<{name: string; description: string; parameters: Record<string, any>}>;
    webhooksEnabled: boolean;
    webhookUrl: string | null;
    webhookEvents: string[];
    projectEmoji: string;
    projectPhoto: string | null;
    publicTitle: string;
    publicDescription: string;
    publicWelcomeMessage: string;
    showBranding: boolean;
    customBrandingText: string | null;
    customBrandingUrl: string | null;
  };
  setProjectConfig: React.Dispatch<React.SetStateAction<{
    systemPrompt: string;
    agentInstructions: string;
    firstMessageMode: 'wait' | 'speak_first' | 'speak_first_with_model_generated_message';
    llmProvider: 'openai' | 'anthropic' | 'google' | 'azure' | 'xai';
    llmModel: string;
    llmTemperature: number;
    llmMaxResponseLength: 150 | 300 | 500 | 1000;
    sttProvider: 'deepgram';
    sttLanguage: 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ja' | 'ko' | 'zh';
    sttQuality: 'standard' | 'enhanced' | 'premium';
    sttProcessingMode: 'streaming' | 'batch';
    sttNoiseSuppression: boolean;
    sttAutoPunctuation: boolean;
    ttsProvider: 'cartesia' | 'openai' | 'clone_voice';
    ttsVoice: string;
    phoneNumber: string | null;
    phoneInboundEnabled: boolean;
    phoneOutboundEnabled: boolean;
    phoneRecordingEnabled: boolean;
    responseLatencyPriority: 'speed' | 'balanced' | 'quality';
    knowledgeBaseFiles: Array<{name: string; type: "pdf" | "txt" | "docx" | "csv" | "json"; content: string; size: number}>;
    functionsEnabled: boolean;
    customFunctions: Array<{name: string; description: string; parameters: Record<string, any>}>;
    webhooksEnabled: boolean;
    webhookUrl: string | null;
    webhookEvents: string[];
    projectEmoji: string;
    projectPhoto: string | null;
    publicTitle: string;
    publicDescription: string;
    publicWelcomeMessage: string;
    showBranding: boolean;
    customBrandingText: string | null;
    customBrandingUrl: string | null;
  }>>;
  customVoices: Array<{ id: string; displayName: string }>;
  onShowCloneVoiceModal: () => void;
  onModelChange?: (model: string) => void;
}

const providers = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'azure', label: 'Azure OpenAI' },
  { value: 'xai', label: 'xAI' }
];

const modelsByProvider: { [key: string]: { value: string; label: string }[] } = {
  openai: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' }
  ],
  anthropic: [
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' }
  ],
  google: [
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { value: 'gemini-pro', label: 'Gemini Pro' }
  ],
  azure: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Azure)' },
    { value: 'gpt-4o', label: 'GPT-4o (Azure)' },
    { value: 'gpt-4', label: 'GPT-4 (Azure)' },
    { value: 'gpt-35-turbo', label: 'GPT-3.5 Turbo (Azure)' }
  ],
  xai: [
    { value: 'grok-3', label: 'Grok-3' }
  ]
};

export function ModelsTab({
  projectConfig,
  setProjectConfig,
  customVoices,
  onShowCloneVoiceModal,
  onModelChange
}: ModelsTabProps) {
  const modelsTabContainerRef = React.useRef<HTMLDivElement>(null);

  // Debug logging
  React.useEffect(() => {
    console.log('🔍 ModelsTab DEBUG:');
    console.log('   • projectConfig.llmProvider:', projectConfig.llmProvider);
    console.log('   • projectConfig.llmModel:', projectConfig.llmModel);
    console.log('   • modelsByProvider keys:', Object.keys(modelsByProvider));
    console.log('   • modelsByProvider[openai]:', modelsByProvider.openai);
    console.log('   • modelsByProvider[xai]:', modelsByProvider.xai);
    console.log('   • Available models for current provider:', modelsByProvider[projectConfig.llmProvider]);
    console.log('   • Is current model valid?:', modelsByProvider[projectConfig.llmProvider]?.some(model => model.value === projectConfig.llmModel));
  }, [projectConfig.llmProvider, projectConfig.llmModel]);

  // Validate and fix model selection when component mounts or provider changes
  React.useEffect(() => {
    const availableModels = modelsByProvider[projectConfig.llmProvider];
    const currentModel = projectConfig.llmModel;
    
    console.log('🔧 Model validation check:');
    console.log('   • Provider:', projectConfig.llmProvider);
    console.log('   • Current model:', currentModel);
    console.log('   • Available models:', availableModels);
    
    // Check if the current provider is supported
    if (!availableModels) {
      console.log(`🔧 Unsupported provider "${projectConfig.llmProvider}". Switching to OpenAI.`);
      const defaultModel = modelsByProvider.openai[0].value;
      setProjectConfig(prev => ({
        ...prev,
        llmProvider: 'openai',
        llmModel: defaultModel
      }));
      onModelChange?.(defaultModel);
      return;
    }
    
    // Check if current model is valid for the selected provider
    const isValidModel = availableModels?.some(model => model.value === currentModel);
    console.log('   • Is valid model?:', isValidModel);
    
    if (!isValidModel && availableModels?.length > 0) {
      console.log(`🔧 Invalid model "${currentModel}" for provider "${projectConfig.llmProvider}". Setting to "${availableModels[0].value}"`);
      const firstModel = availableModels[0].value;
      setProjectConfig(prev => ({ 
        ...prev, 
        llmModel: firstModel
      }));
      onModelChange?.(firstModel);
    }
  }, [projectConfig.llmProvider, projectConfig.llmModel, setProjectConfig, onModelChange]);

  // Prevent scroll propagation to parent elements
  const handleScroll = (e: React.UIEvent) => {
    e.stopPropagation();
  };

  // Handle wheel events at container boundaries
  const handleWheel = (e: React.WheelEvent) => {
    const container = modelsTabContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtTop = scrollTop === 0;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;

    // Prevent parent scrolling when at boundaries
    if ((isAtTop && e.deltaY < 0) || (isAtBottom && e.deltaY > 0)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div 
      ref={modelsTabContainerRef}
      className="h-full bg-black overflow-y-auto"
      onScroll={handleScroll}
      onWheel={handleWheel}
      style={{
        overscrollBehavior: 'contain',
        isolation: 'isolate'
      }}
    >
      {/* Combined Models Configuration Section */}
      <div className="bg-white/10 backdrop-blur-sm min-h-full p-8 pb-24 w-full">
        {/* Base Model Configuration */}
        <div className="mb-8">
          <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
            <svg className="w-6 h-6 mr-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Base Model
          </h3>
          
          <div className="space-y-6">
            <p className="text-white/70">
              Choose the AI model that will power your voice agent's conversations and responses.
            </p>
          
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Provider Selection */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-white/70">
                  Provider
                </label>
                <div className="relative">
                  <select 
                    value={projectConfig.llmProvider}
                    onChange={(e) => {
                      const newProvider = e.target.value;
                      // Get the first available model for the new provider
                      const firstModel = modelsByProvider[newProvider]?.[0]?.value;
                      setProjectConfig(prev => ({ 
                        ...prev, 
                        llmProvider: newProvider as any,
                        llmModel: firstModel || prev.llmModel
                      }));
                      if (firstModel) {
                        onModelChange?.(firstModel);
                      }
                    }}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-white/30 appearance-none cursor-pointer transition-all duration-200 hover:bg-white/10 pr-10"
                  >
                    {providers.map(provider => (
                      <option key={provider.value} value={provider.value} className="bg-gray-700 text-white">
                        {provider.label}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg className="w-5 h-5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Model Selection */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-white/70">
                  Model
                </label>
                <div className="relative">
                  <select 
                    value={projectConfig.llmModel}
                    onChange={(e) => {
                      console.log('🔄 Model changed to:', e.target.value);
                      setProjectConfig(prev => ({ ...prev, llmModel: e.target.value }));
                      onModelChange?.(e.target.value);
                    }}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-white/30 appearance-none cursor-pointer transition-all duration-200 hover:bg-white/10 pr-10"
                  >
                    {(() => {
                      const models = modelsByProvider[projectConfig.llmProvider];
                      console.log('🎯 Rendering models for provider:', projectConfig.llmProvider);
                      console.log('🎯 Available models:', models);
                      console.log('🎯 Current llmModel value:', projectConfig.llmModel);
                      
                      if (!models) {
                        console.log('❌ No models found for provider:', projectConfig.llmProvider);
                        return <option value="">No models available</option>;
                      }
                      
                      return models.map(model => {
                        console.log('🎯 Rendering model option:', model.value, model.label);
                        return (
                          <option key={model.value} value={model.value} className="bg-gray-700 text-white">
                            {model.label}
                          </option>
                        );
                      });
                    })()}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg className="w-5 h-5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Temperature */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-white/70">
                  Temperature
                </label>
                <div className="space-y-2">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={projectConfig.llmTemperature}
                    onChange={(e) => setProjectConfig(prev => ({ ...prev, llmTemperature: parseFloat(e.target.value) }))}
                    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="flex justify-between text-xs text-white/50">
                    <span>Conservative (0)</span>
                    <span>Balanced (1)</span>
                    <span>Creative (2)</span>
                  </div>
                </div>
              </div>

              {/* Max Tokens */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-white/70">
                  Max Response Length
                </label>
                <div className="relative">
                  <select 
                    value={projectConfig.llmMaxResponseLength}
                    onChange={(e) => setProjectConfig(prev => ({ ...prev, llmMaxResponseLength: parseInt(e.target.value) as any }))}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-white/30 appearance-none cursor-pointer transition-all duration-200 hover:bg-white/10 pr-10"
                  >
                    <option value="150" className="bg-gray-700 text-white">Short (150 tokens)</option>
                    <option value="300" className="bg-gray-700 text-white">Medium (300 tokens)</option>
                    <option value="500" className="bg-gray-700 text-white">Long (500 tokens)</option>
                    <option value="1000" className="bg-gray-700 text-white">Very Long (1000 tokens)</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg className="w-5 h-5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/20 mb-8"></div>

        {/* Transcriber Configuration */}
        <div className="mb-8">
          <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
            <svg className="w-6 h-6 mr-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            Speech-to-Text (Transcriber)
          </h3>
          
          <div className="space-y-6">
            <p className="text-white/70">
              Configure how your agent converts speech to text for processing.
            </p>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Transcriber Provider */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-white/70">
                  Transcriber Provider
                </label>
                <div className="bg-white/5 border border-white/20 rounded-xl px-4 py-3">
                  <span className="text-white">Deepgram</span>
                </div>
              </div>

              {/* Language */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-white/70">
                  Language
                </label>
                <div className="relative">
                  <select 
                    value={projectConfig.sttLanguage}
                    onChange={(e) => setProjectConfig(prev => ({ ...prev, sttLanguage: e.target.value as any }))}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-white/30 appearance-none cursor-pointer transition-all duration-200 hover:bg-white/10 pr-10"
                  >
                    <option value="en" className="bg-gray-700 text-white">English</option>
                    <option value="multi" className="bg-gray-700 text-white">Multilingual</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg className="w-5 h-5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Model Quality */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-white/70">
                  Transcription Quality
                </label>
                <div className="relative">
                  <select 
                    value={projectConfig.sttQuality}
                    onChange={(e) => setProjectConfig(prev => ({ ...prev, sttQuality: e.target.value as any }))}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-white/30 appearance-none cursor-pointer transition-all duration-200 hover:bg-white/10 pr-10"
                  >
                    <option value="standard" className="bg-gray-700 text-white">Standard (Faster, Lower Cost)</option>
                    <option value="enhanced" className="bg-gray-700 text-white">Enhanced (Balanced)</option>
                    <option value="premium" className="bg-gray-700 text-white">Premium (Highest Accuracy)</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg className="w-5 h-5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/20 mb-8"></div>

        {/* Voice Configuration */}
        <div>
          <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
            <svg className="w-6 h-6 mr-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            Text-to-Speech (Voice)
          </h3>
          
          <div className="space-y-6">
            <p className="text-white/70">
              Configure how your agent's responses are converted to speech.
            </p>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Voice Provider */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-white/70">
                  Voice Provider
                </label>
                <div className="relative">
                  <select 
                    value={projectConfig.ttsProvider}
                    onChange={(e) => {
                      const newProvider = e.target.value;
                      setProjectConfig(prev => ({ 
                        ...prev, 
                        ttsProvider: newProvider as any,
                        // If switching to OpenAI and current voice is british_male, switch to neutral
                        // If switching to Clone Voice, switch to custom
                        ttsVoice: newProvider === 'openai' && prev.ttsVoice === 'british_male' ? 'neutral' : 
                                 newProvider === 'clone_voice' ? 'custom' : prev.ttsVoice
                      }));
                    }}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-white/30 appearance-none cursor-pointer transition-all duration-200 hover:bg-white/10 pr-10"
                  >
                    <option value="cartesia" className="bg-gray-700 text-white">Cartesia</option>
                    <option value="openai" className="bg-gray-700 text-white">OpenAI</option>
                    <option value="clone_voice" className="bg-gray-700 text-white">Clone Voice</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg className="w-5 h-5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Voice Selection */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-white/70">
                  Voice
                </label>
                <div className="relative">
                  <select 
                    value={projectConfig.ttsVoice}
                    onChange={(e) => setProjectConfig(prev => ({ ...prev, ttsVoice: e.target.value as any }))}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-white/30 appearance-none cursor-pointer transition-all duration-200 hover:bg-white/10 pr-10"
                  >
                    {projectConfig.ttsProvider === 'clone_voice' ? (
                      customVoices.length > 0 ? (
                        customVoices.map((voice) => (
                          <option key={voice.id} value={voice.id} className="bg-gray-700 text-white">
                            {voice.displayName}
                          </option>
                        ))
                      ) : (
                        <option value="" className="bg-gray-700 text-white">Create a custom voice below</option>
                      )
                    ) : (
                      <>
                        <option value="neutral" className="bg-gray-700 text-white">Neutral</option>
                        <option value="male" className="bg-gray-700 text-white">Male</option>
                        {projectConfig.ttsProvider !== 'openai' && (
                          <option value="british_male" className="bg-gray-700 text-white">British Male</option>
                        )}
                        <option value="deep_male" className="bg-gray-700 text-white">Deep Male</option>
                        <option value="female" className="bg-gray-700 text-white">Female</option>
                        <option value="soft_female" className="bg-gray-700 text-white">Soft Female</option>
                      </>
                    )}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg className="w-5 h-5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Clone Voice Button */}
            {projectConfig.ttsProvider === 'clone_voice' && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={onShowCloneVoiceModal}
                  className="px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Clone New Voice</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 