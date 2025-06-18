import { useState } from "react";
import { motion } from "framer-motion";

export interface VoiceAgentConfig {
  prompt: string;
  personality: string;
  capabilities: string[];
  language: string;
  responseStyle: string;
  customFunctions?: Array<{name: string; description: string; parameters: Record<string, any>; headers?: Record<string, string>; body?: any; url?: string}>;
}

interface VoiceAgentConfigProps {
  onConfigurationComplete: (config: VoiceAgentConfig, generatedCode: string) => void;
}

export function VoiceAgentConfig({ onConfigurationComplete }: VoiceAgentConfigProps) {
  const [config, setConfig] = useState<VoiceAgentConfig>({
    prompt: "",
    personality: "friendly",
    capabilities: [],
    language: "english",
    responseStyle: "conversational"
  });
  
  const [isGenerating, setIsGenerating] = useState(false);

  const personalityOptions = [
    { value: "friendly", label: "Friendly & Approachable" },
    { value: "professional", label: "Professional & Formal" },
    { value: "casual", label: "Casual & Relaxed" },
    { value: "witty", label: "Witty & Humorous" },
    { value: "empathetic", label: "Empathetic & Supportive" }
  ];

  const capabilityOptions = [
    "Answer questions",
    "Provide recommendations", 
    "Schedule appointments",
    "Take notes",
    "Translate languages",
    "Summarize content",
    "Creative writing",
    "Technical support"
  ];

  const languageOptions = [
    { value: "english", label: "English" },
    { value: "spanish", label: "Spanish" },
    { value: "french", label: "French" },
    { value: "german", label: "German" },
    { value: "chinese", label: "Chinese" },
    { value: "japanese", label: "Japanese" }
  ];

  const responseStyleOptions = [
    { value: "conversational", label: "Conversational" },
    { value: "concise", label: "Concise & Direct" },
    { value: "detailed", label: "Detailed & Thorough" },
    { value: "creative", label: "Creative & Expressive" }
  ];

  const handleCapabilityChange = (capability: string, checked: boolean) => {
    setConfig(prev => ({
      ...prev,
      capabilities: checked 
        ? [...prev.capabilities, capability]
        : prev.capabilities.filter(c => c !== capability)
    }));
  };

  const generateCode = async () => {
    setIsGenerating(true);
    try {
      const prompt = `Generate ONLY Python code for a complete LiveKit voice agent following the exact structure from LiveKit documentation. Do not include any explanatory text, comments, or markdown formatting - just raw executable Python code.

Please search the LiveKit documentation for the most current patterns and generate the COMPLETE agent structure with all necessary components:

1. Import statements (dotenv, agents, plugins)
2. load_dotenv() call
3. Custom Agent class extending Agent
4. entrypoint function with AgentSession setup
5. Main execution block

Configuration to implement in the Agent instructions:
- Main prompt/role: "${config.prompt}"
- Personality: "${config.personality}" (${config.personality === 'friendly' ? 'warm and approachable' : config.personality === 'professional' ? 'formal and business-like' : config.personality === 'casual' ? 'relaxed and informal' : config.personality === 'witty' ? 'clever and humorous' : 'empathetic and supportive'})
- Capabilities: ${config.capabilities.join(', ')}
- Language: "${config.language}"
- Response style: "${config.responseStyle}"

Build comprehensive instructions that incorporate all these elements into the Agent constructor's instructions parameter.

Generate the complete agent code with proper structure following the latest LiveKit patterns.`;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate code');
      }

      const data = await response.json();
      
      // Clean the generated code by removing any markdown formatting or extra text
      let cleanCode = data.content;
      
      // Remove markdown code blocks if present
      cleanCode = cleanCode.replace(/```python\n?/g, '');
      cleanCode = cleanCode.replace(/```\n?/g, '');
      
      // Remove any leading/trailing whitespace
      cleanCode = cleanCode.trim();
      
      // If the code doesn't start with import or from, try to extract just the code part
      if (!cleanCode.startsWith('import') && !cleanCode.startsWith('from')) {
        // Look for the first line that starts with import or from
        const lines = cleanCode.split('\n');
        const codeStartIndex = lines.findIndex((line: string) => 
          line.trim().startsWith('import') || 
          line.trim().startsWith('from')
        );
        if (codeStartIndex !== -1) {
          cleanCode = lines.slice(codeStartIndex).join('\n');
        }
      }
      
      onConfigurationComplete(config, cleanCode);
    } catch (error) {
      console.error('Error generating code:', error);
      alert('Failed to generate code. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-2xl mx-auto p-6 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20"
    >
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Configure Your Voice Agent</h2>
          <p className="text-gray-300">Describe how you want your AI assistant to behave</p>
        </div>

        {/* Main Prompt */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-white">
            Voice Agent Prompt *
          </label>
          <textarea
            value={config.prompt}
            onChange={(e) => setConfig(prev => ({ ...prev, prompt: e.target.value }))}
            placeholder="Describe your voice agent's role, behavior, and any specific instructions..."
            className="w-full h-32 p-3 bg-black/30 border border-white/30 rounded-lg text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none resize-none"
          />
        </div>

        {/* Personality */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-white">Personality</label>
          <select
            value={config.personality}
            onChange={(e) => setConfig(prev => ({ ...prev, personality: e.target.value }))}
            className="w-full p-3 bg-black/30 border border-white/30 rounded-lg text-white focus:border-blue-400 focus:outline-none"
          >
            {personalityOptions.map(option => (
              <option key={option.value} value={option.value} className="bg-gray-800">
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Capabilities */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-white">Capabilities</label>
          <div className="grid grid-cols-2 gap-2">
            {capabilityOptions.map(capability => (
              <label key={capability} className="flex items-center space-x-2 text-sm text-white">
                <input
                  type="checkbox"
                  checked={config.capabilities.includes(capability)}
                  onChange={(e) => handleCapabilityChange(capability, e.target.checked)}
                  className="rounded border-white/30 bg-black/30 text-blue-500 focus:ring-blue-400"
                />
                <span>{capability}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Language */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white">Language</label>
            <select
              value={config.language}
              onChange={(e) => setConfig(prev => ({ ...prev, language: e.target.value }))}
              className="w-full p-3 bg-black/30 border border-white/30 rounded-lg text-white focus:border-blue-400 focus:outline-none"
            >
              {languageOptions.map(option => (
                <option key={option.value} value={option.value} className="bg-gray-800">
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Response Style */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white">Response Style</label>
            <select
              value={config.responseStyle}
              onChange={(e) => setConfig(prev => ({ ...prev, responseStyle: e.target.value }))}
              className="w-full p-3 bg-black/30 border border-white/30 rounded-lg text-white focus:border-blue-400 focus:outline-none"
            >
              {responseStyleOptions.map(option => (
                <option key={option.value} value={option.value} className="bg-gray-800">
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Submit Button */}
        <motion.button
          onClick={generateCode}
          className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors duration-200"
        >
          {isGenerating ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Generating Agent Code...
            </div>
          ) : (
            "Generate Voice Agent"
          )}
        </motion.button>
      </div>
    </motion.div>
  );
} 