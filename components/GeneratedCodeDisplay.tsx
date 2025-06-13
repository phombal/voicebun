import { useState, useEffect, useRef, useCallback } from 'react';
import { type VoiceAgentConfig } from './VoiceAgentConfig';
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
import { NoAgentNotification } from "./NoAgentNotification";
import { AnimatePresence, motion } from "framer-motion";
import { Room, RoomEvent } from "livekit-client";
import Editor from '@monaco-editor/react';
import { useDatabase } from '@/hooks/useDatabase';
import { useAuth } from '@/contexts/AuthContext';
import { ChatSession, Project } from '@/lib/database/types';
import { TelnyxNumbersModal } from './TelnyxNumbersModal';
import { PhoneNumberManager } from './PhoneNumberManager';

interface GeneratedCodeDisplayProps {
  code: string;
  config: VoiceAgentConfig;
  project?: Project; // Add project as optional prop
  onStartConversation?: () => void;
  onReconfigure: () => void;
  onBackToHome: () => void;
}

interface PhoneNumberFeature {
  name: string;
}



interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  checkpoint?: boolean; // Mark messages that created file changes
  filesSnapshot?: Map<string, string>; // Snapshot of all files at this point
  isError?: boolean; // Mark error messages
}





export function GeneratedCodeDisplay({ code, config, project, onBackToHome }: Omit<GeneratedCodeDisplayProps, 'onReconfigure'>) {
  // Debug logging on every render
  console.log('🔍 GeneratedCodeDisplay RENDER:');
  console.log('   • Component props:', { hasCode: !!code, hasConfig: !!config, hasProject: !!project });
  console.log('   • Config prompt:', config?.prompt?.substring(0, 50) + '...' || 'NO PROMPT');
  console.log('🎨 GeneratedCodeDisplay rendered with project:', project?.id || 'null');
  // State variables
  const [currentCode, setCurrentCode] = useState(code);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [availableCheckpoints, setAvailableCheckpoints] = useState<ChatMessage[]>([]);
  const [showCheckpointModal, setShowCheckpointModal] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showTelephonyModal, setShowTelephonyModal] = useState(false);
  const [showTelnyxNumbersModal, setShowTelnyxNumbersModal] = useState(false);
  const [phoneNumberRefreshKey, setPhoneNumberRefreshKey] = useState(0);
  const [availableNumbers, setAvailableNumbers] = useState<Array<{
    id: string; 
    number: string;
    features?: PhoneNumberFeature[];
    region_information?: Array<{ region_name?: string }>;
    cost_information?: {
      monthly_cost?: string;
      upfront_cost?: string;
    };
  }>>([]);
  const [selectedNumber, setSelectedNumber] = useState<{
    id: string; 
    number: string;
    features?: PhoneNumberFeature[];
    region_information?: Array<{ region_name?: string }>;
    cost_information?: {
      monthly_cost?: string;
      upfront_cost?: string;
    };
  } | null>(null);
  const [isLoadingNumbers, setIsLoadingNumbers] = useState(false);
  const [isAssigningNumber, setIsAssigningNumber] = useState(false);
  const [assignedPhoneNumber, setAssignedPhoneNumber] = useState<string | null>(null);
  const [assignedPhoneNumberId, setAssignedPhoneNumberId] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyFile, setHistoryFile] = useState<string | null>(null);
  const [room] = useState(new Room());
  const [isInConversation, setIsInConversation] = useState(false);
  const [activeTab, setActiveTab] = useState<'test' | 'agent' | 'config'>('test');
  
  // Add debug logging for state changes
  useEffect(() => {
    console.log('🔄 STATE CHANGE - isConnecting:', isConnecting);
  }, [isConnecting]);
  
  useEffect(() => {
    console.log('🔄 STATE CHANGE - isInConversation:', isInConversation);
  }, [isInConversation]);
  
  useEffect(() => {
    console.log('🔄 STATE CHANGE - activeTab:', activeTab);
  }, [activeTab]);
  const [activeMenu, setActiveMenu] = useState<'instructions' | 'models' | 'functions' | 'phone' | 'other' | 'test'>('instructions');

  const [currentConfigurationId, setCurrentConfigurationId] = useState<string | null>(null);

  // Context menu state
  const [contextMenuPath, setContextMenuPath] = useState<string | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  
  // Model configuration state
  const [isModelSectionExpanded, setIsModelSectionExpanded] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [selectedModel, setSelectedModel] = useState('gpt-4-turbo');
  const [firstMessageMode, setFirstMessageMode] = useState('greeting');

  // Project configuration state
  const [projectConfig, setProjectConfig] = useState({
    systemPrompt: '', // Will be loaded from database by loadProjectConfiguration
    agentInstructions: '',
    firstMessageMode: 'wait' as 'wait' | 'speak_first' | 'speak_first_with_model_generated_message',
    llmProvider: 'openai' as 'openai' | 'anthropic' | 'google' | 'azure',
    llmModel: 'gpt-4o-mini',
    llmTemperature: 0.7,
    llmMaxResponseLength: 300 as 150 | 300 | 500 | 1000,
    sttProvider: 'deepgram' as 'deepgram',
    sttLanguage: 'en' as 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ja' | 'ko' | 'zh',
    sttQuality: 'enhanced' as 'standard' | 'enhanced' | 'premium',
    sttProcessingMode: 'streaming' as 'streaming' | 'batch',
    sttNoiseSuppression: true,
    sttAutoPunctuation: true,
    ttsProvider: 'cartesia' as 'cartesia' | 'elevenlabs' | 'openai',
    ttsVoice: 'neutral' as 'neutral' | 'male' | 'british_male' | 'deep_male' | 'female' | 'soft_female',

    phoneNumber: null as string | null,
    phoneInboundEnabled: true,
    phoneOutboundEnabled: false,
    phoneRecordingEnabled: true,
    responseLatencyPriority: 'balanced' as 'speed' | 'balanced' | 'quality',
    knowledgeBaseFiles: [] as Array<{name: string; type: string; content: string; size: number}>,
    functionsEnabled: false,
    customFunctions: [] as Array<{name: string; description: string; parameters: Record<string, any>}>,
    webhooksEnabled: false,
    webhookUrl: null as string | null,
    webhookEvents: [] as string[]
  });
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // New file modal state
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileType, setNewFileType] = useState<'file' | 'folder'>('file');
  const [newFileParentPath, setNewFileParentPath] = useState('/');

  // Database integration state
  const [codeEditSession, setCodeEditSession] = useState<ChatSession | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const { user } = useAuth();
  const { 
    currentProject, 
    startChatSession,
    createProject,
    createProjectData,
    getProjectData,
    updateProjectData,
    getProjectPhoneNumbers
  } = useDatabase();
  
  // Ref for debouncing file saves
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Refs to store initial values and prevent re-creation
  const initialConfigRef = useRef(config);
  const initialCodeRef = useRef(code);





  // Load agent configurations function (simplified - using project_data)
  const loadAgentConfigurations = useCallback(async () => {
    try {
      if (!currentProject) {
        console.log('❌ No current project for loading configurations');
        return;
      }

      console.log('📥 Loading agent configurations for project:', currentProject.name);
      // Configuration loading is now handled by loadProjectConfiguration using project_data table
      console.log('✅ Agent configuration loading handled by project data system');
    } catch (error) {
      console.error('❌ Error loading agent configurations:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        error: error
      });
    }
  }, [currentProject]);

  // Create a snapshot of current code
  const createFilesSnapshot = useCallback((): Map<string, string> => {
    const snapshot = new Map<string, string>();
    snapshot.set('/voice_agent.py', currentCode);
    return snapshot;
  }, [currentCode]);

  // Initialize database session for code editing
  useEffect(() => {
    const initCodeEditSession = async () => {
      if (currentProject && !codeEditSession) {
        try {
          const session = await startChatSession(currentProject.id);
          setCodeEditSession(session);
          console.log('📝 Started code editing session:', session.id);
        } catch (error) {
          console.error('❌ Failed to start code editing session:', error);
        }
      }
    };

    initCodeEditSession();
  }, [currentProject, codeEditSession, startChatSession]);

  // Debug project prop changes
  useEffect(() => {
    console.log('🎯 Project prop changed:', project?.id || 'null');
  }, [project]);

  // Debug projectConfig changes
  useEffect(() => {
    console.log('📋 ProjectConfig changed - systemPrompt length:', projectConfig.systemPrompt?.length || 0);
    if (projectConfig.systemPrompt) {
      console.log('📋 SystemPrompt preview:', projectConfig.systemPrompt.substring(0, 100) + '...');
    }
  }, [projectConfig.systemPrompt]);

  // Auto-create project if one doesn't exist (only once per component mount)
  useEffect(() => {
    // Project creation is now handled by the main page, so we don't need auto-creation here
    // This prevents duplicate project creation
    console.log('🔍 Current project on mount:', currentProject?.id || 'none');
  }, [currentProject]);

  // Load project configuration from database
  // Load assigned phone number for the project
  const loadAssignedPhoneNumber = useCallback(async () => {
    const projectToUse = project || currentProject;
    if (!projectToUse) return;
    
    try {
      const phoneNumbers = await getProjectPhoneNumbers(projectToUse.id);
      console.log('📱 Project phone numbers loaded:', phoneNumbers);
      console.log('📱 Number of phone numbers found:', phoneNumbers.length);
      
      if (phoneNumbers.length > 0) {
        // Debug: Log all phone numbers with their status
        phoneNumbers.forEach((pn: any, index: number) => {
          console.log(`📱 Phone #${index + 1}:`, {
            id: pn.id,
            number: pn.phone_number,
            status: pn.status,
            is_active: pn.is_active,
            dispatch_rule_id: pn.dispatch_rule_id
          });
        });
        
        // Try to find an active phone number with more flexible criteria
        let activePhoneNumber = phoneNumbers.find((pn: any) => pn.is_active && pn.status === 'active');
        
        // If no "active" status found, try other common status values
        if (!activePhoneNumber) {
          console.log('📱 No phone number with status="active" found, trying other statuses...');
          activePhoneNumber = phoneNumbers.find((pn: any) => pn.is_active && pn.status === 'assigned');
        }
        
        // If still not found, try any active phone number
        if (!activePhoneNumber) {
          console.log('📱 No phone number with status="assigned" found, trying any active...');
          activePhoneNumber = phoneNumbers.find((pn: any) => pn.is_active);
        }
        
        // If still not found, just take the first one
        if (!activePhoneNumber && phoneNumbers.length > 0) {
          console.log('📱 No active phone number found, taking the first one...');
          activePhoneNumber = phoneNumbers[0];
        }
        
        if (activePhoneNumber) {
          setAssignedPhoneNumber(activePhoneNumber.phone_number);
          setAssignedPhoneNumberId(activePhoneNumber.id);
          console.log('📱 Loaded assigned phone number:', {
            number: activePhoneNumber.phone_number,
            id: activePhoneNumber.id,
            status: activePhoneNumber.status,
            is_active: activePhoneNumber.is_active
          });
        } else {
          console.log('📱 No suitable phone number found');
        }
      } else {
        console.log('📱 No phone numbers found for this project');
      }
    } catch (error) {
      console.error('❌ Error loading assigned phone number:', error);
    }
  }, [project, currentProject, getProjectPhoneNumbers]);

  const loadProjectConfiguration = useCallback(async () => {
    const projectToUse = project || currentProject;
    if (!projectToUse) {
      console.log('❌ loadProjectConfiguration: No project available (prop or currentProject)');
      return;
    }
    
    console.log('🔍 Loading project configuration for:', projectToUse.id);
    
    try {
      const projectData = await getProjectData(projectToUse.id);
      console.log('📥 Project data from database:', projectData ? 'found' : 'not found');
      
      if (projectData) {
        console.log('📝 System prompt from database:', projectData.system_prompt ? `${projectData.system_prompt.substring(0, 100)}...` : 'empty');
        
        const newConfig = {
          systemPrompt: projectData.system_prompt,
          agentInstructions: projectData.agent_instructions || '',
          firstMessageMode: projectData.first_message_mode,
          llmProvider: projectData.llm_provider,
          llmModel: projectData.llm_model,
          llmTemperature: projectData.llm_temperature,
          llmMaxResponseLength: projectData.llm_max_response_length,
          sttProvider: projectData.stt_provider,
          sttLanguage: projectData.stt_language,
          sttQuality: projectData.stt_quality,
          sttProcessingMode: projectData.stt_processing_mode,
          sttNoiseSuppression: projectData.stt_noise_suppression,
          sttAutoPunctuation: projectData.stt_auto_punctuation,
          ttsProvider: projectData.tts_provider,
          ttsVoice: projectData.tts_voice,
          phoneNumber: projectData.phone_number,
          phoneInboundEnabled: projectData.phone_inbound_enabled,
          phoneOutboundEnabled: projectData.phone_outbound_enabled,
          phoneRecordingEnabled: projectData.phone_recording_enabled,
          responseLatencyPriority: projectData.response_latency_priority,
          knowledgeBaseFiles: projectData.knowledge_base_files,
          functionsEnabled: projectData.functions_enabled,
          customFunctions: projectData.custom_functions,
          webhooksEnabled: projectData.webhooks_enabled,
          webhookUrl: projectData.webhook_url,
          webhookEvents: projectData.webhook_events
        };
        
        console.log('🔧 Setting project config with system prompt length:', newConfig.systemPrompt?.length || 0);
        setProjectConfig(newConfig);
        console.log('✅ Loaded project configuration from database');
        console.log('🎯 System prompt loaded:', projectData.system_prompt ? 'YES' : 'NO');
      } else {
        console.log('❌ No project data found in database');
      }
      } catch (error) {
      console.error('❌ Failed to load project configuration:', error);
    }
  }, [project, currentProject, getProjectData]);

  // Save project configuration to database
  const saveProjectConfiguration = useCallback(async () => {
    console.log('🔧 Save configuration clicked!');
    console.log('🔍 Project config state:', {
      systemPrompt: projectConfig.systemPrompt.substring(0, 50) + '...',
      llmProvider: projectConfig.llmProvider,
      llmModel: projectConfig.llmModel,
      ttsProvider: projectConfig.ttsProvider,
      ttsVoice: projectConfig.ttsVoice
    });

    const projectToUse = project || currentProject;
    if (!projectToUse) {
      console.error('❌ No project available to save configuration to');
      
      // Show error notification
      const notification = document.createElement('div');
      notification.textContent = 'No project found to save configuration to. Please refresh the page.';
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 5000);
      return;
    }

    setIsSavingConfig(true);
    try {
      // Check if project data already exists
      console.log('🔍 Checking for existing project data...');
      const existingData = await getProjectData(projectToUse.id);
      console.log('📥 Existing data found:', existingData ? 'yes' : 'no');
      
      const configData = {
        system_prompt: projectConfig.systemPrompt,
        agent_instructions: projectConfig.agentInstructions,
        first_message_mode: projectConfig.firstMessageMode,
        llm_provider: projectConfig.llmProvider,
        llm_model: projectConfig.llmModel,
        llm_temperature: projectConfig.llmTemperature,
        llm_max_response_length: projectConfig.llmMaxResponseLength,
        stt_provider: projectConfig.sttProvider,
        stt_language: projectConfig.sttLanguage,
        stt_quality: projectConfig.sttQuality,
        stt_processing_mode: projectConfig.sttProcessingMode,
        stt_noise_suppression: projectConfig.sttNoiseSuppression,
        stt_auto_punctuation: projectConfig.sttAutoPunctuation,
        tts_provider: projectConfig.ttsProvider,
        tts_voice: projectConfig.ttsVoice,
        phone_number: projectConfig.phoneNumber,
        phone_inbound_enabled: projectConfig.phoneInboundEnabled,
        phone_outbound_enabled: projectConfig.phoneOutboundEnabled,
        phone_recording_enabled: projectConfig.phoneRecordingEnabled,
        response_latency_priority: projectConfig.responseLatencyPriority,
        knowledge_base_files: projectConfig.knowledgeBaseFiles,
        functions_enabled: projectConfig.functionsEnabled,
        custom_functions: projectConfig.customFunctions,
        webhooks_enabled: projectConfig.webhooksEnabled,
        webhook_url: projectConfig.webhookUrl,
        webhook_events: projectConfig.webhookEvents
      };

      console.log('💾 Attempting to save config data:', {
        projectId: projectToUse.id,
        configData: Object.keys(configData)
      });

      if (existingData) {
        // Update existing configuration
        console.log('🔄 Updating existing configuration...');
        await updateProjectData(projectToUse.id, configData);
        console.log('✅ Updated project configuration in database');
        // Show success notification
        const notification = document.createElement('div');
        notification.textContent = 'Changes saved successfully!';
        notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        document.body.appendChild(notification);
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
        }, 3000);
      } else {
        // Create new configuration
        console.log('🆕 Creating new configuration...');
        await createProjectData(projectToUse.id, configData);
        console.log('✅ Created new project configuration in database');
        
        // Show success notification
        const notification = document.createElement('div');
        notification.textContent = 'Changes saved successfully!';
        notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        document.body.appendChild(notification);
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
        }, 3000);
      }
      } catch (error) {
      console.error('❌ Failed to save project configuration:', error);
      console.error('❌ Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace',
        errorType: error?.constructor?.name || 'Unknown type',
        configData: {
          ttsProvider: projectConfig.ttsProvider,
          ttsVoice: projectConfig.ttsVoice,
          llmProvider: projectConfig.llmProvider,
          sttProvider: projectConfig.sttProvider
        }
      });
      
      // Show error notification
      const notification = document.createElement('div');
      notification.textContent = 'Failed to save changes. Please try again.';
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 5000);
    } finally {
      setIsSavingConfig(false);
    }
  }, [project, currentProject, projectConfig, getProjectData, updateProjectData, createProjectData]);

  // Load agent configurations when project changes
  useEffect(() => {
    const projectToUse = project || currentProject;
    console.log('🔄 Project changed, project prop:', project?.id || 'null', 'current project:', currentProject?.id || 'null');
    if (projectToUse) {
      console.log('📥 Loading configurations for project:', projectToUse.name);
      loadAgentConfigurations();
      loadProjectConfiguration();
      loadAssignedPhoneNumber();
    } else {
      console.log('⏭️ Skipping configuration load - no project available');
    }
  }, [project, currentProject, loadAgentConfigurations, loadProjectConfiguration, loadAssignedPhoneNumber]);

  // Save file changes to database
  const saveFileChangesToDatabase = async (changeDescription?: string) => {
    if (currentProject && codeEditSession) {
      try {
        console.log('💾 File changes tracked locally (database file storage removed)');
        console.log('   • Project ID:', currentProject.id);
        console.log('   • Session ID:', codeEditSession.id);
        console.log('   • Change description:', changeDescription || 'No description');
        console.log('✅ File changes logged successfully');
      } catch (error) {
        console.error('❌ Failed to log file changes:', error);
      }
    } else {
      console.log('⏭️ Skipping file change logging - missing project or session');
    }
  };

  // Debug logging for conversation state
  useEffect(() => {
    console.log('🔄 Conversation state changed:', isInConversation);
  }, [isInConversation]);

  // Auto-end conversation when navigating away from test tab
  useEffect(() => {
    if (activeMenu !== 'test' && isInConversation) {
      console.log('🔄 User navigated away from test tab, ending conversation...');
      endConversation();
    }
  }, [activeMenu, isInConversation]);



  // Initialize chat
  useEffect(() => {
    // Initialize chat with welcome message and create initial checkpoint
    const welcomeMessage: ChatMessage = {
      id: '1',
      role: 'assistant',
      content: `Hi! I'm Bun, your voice agent configuration assistant. I can help you optimize your agent's settings for your specific use case.

I can suggest changes to:
• System prompts and agent personality
• Model selection and parameters  
• Speech-to-text and text-to-speech settings
• Response latency and quality preferences
• Phone and webhook configurations

Just tell me what you want your voice agent to do or any issues you're experiencing, and I'll suggest the best configuration settings for you. What would you like to configure?`,
      timestamp: new Date(),
      checkpoint: true,
      filesSnapshot: createFilesSnapshot()
    };
    
    setMessages([welcomeMessage]);
    setAvailableCheckpoints([welcomeMessage]);
  }, [code, config, createFilesSnapshot]);

  // Restore files from a checkpoint snapshot
  const restoreFromCheckpoint = (snapshot: Map<string, string>) => {
    // Restore the main voice agent code from snapshot
    const voiceAgentContent = snapshot.get('/voice_agent.py');
    if (voiceAgentContent) {
      setCurrentCode(voiceAgentContent);
    }
  };



  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(currentCode);
      
      // Show success notification
      const notification = document.createElement('div');
      notification.textContent = 'Copied to clipboard!';
      notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 2000);
    } catch (error) {
      // Show error notification
      const notification = document.createElement('div');
      notification.textContent = 'Failed to copy. Please try again.';
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 3000);
    }
  };

  const handlePublish = async () => {
    const projectToUse = project || currentProject;
    if (!projectToUse) {
      const notification = document.createElement('div');
      notification.textContent = 'Please select a project first.';
      notification.className = 'fixed top-4 right-4 bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 3000);
      return;
    }

    setIsPublishing(true);
    
    try {
      // Get phone numbers for the current project
      const phoneNumbers = await getProjectPhoneNumbers(projectToUse.id);
      
      if (!phoneNumbers || phoneNumbers.length === 0) {
        // Show helpful message about purchasing a phone number
        const notification = document.createElement('div');
        notification.innerHTML = `
          <div class="flex items-center space-x-2">
            <svg class="w-5 h-5 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>To publish your voice agent, you need to purchase a phone number first.</span>
          </div>
        `;
        notification.className = 'fixed top-4 right-4 bg-blue-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 max-w-sm';
        document.body.appendChild(notification);
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
        }, 6000);
        return;
      }

      console.log(`📞 Found ${phoneNumbers.length} phone number(s) to update`);

      const updateResults: Array<{
        phoneNumber: string;
        phoneNumberId: string;
        success: boolean;
        result?: any;
        error?: string;
      }> = [];
      
      let successCount = 0;
      let errorCount = 0;
      
      for (let i = 0; i < phoneNumbers.length; i++) {
        const phoneNumber = phoneNumbers[i];
        console.log(`🔄 Updating phone number ${i + 1}/${phoneNumbers.length}: ${phoneNumber.phone_number}`);
        
        try {
          const response = await fetch('/api/update-dispatch-rule', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              phoneNumberId: phoneNumber.id,
              projectId: projectToUse.id,
              userId: user?.id, // Add userId from authenticated user
            }),
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to update dispatch rule');
          }
          
          const result = await response.json();
          
          updateResults.push({
            phoneNumber: phoneNumber.phone_number,
            phoneNumberId: phoneNumber.id,
            success: true,
            result: result
          });
          successCount++;
          console.log(`✅ Updated ${phoneNumber.phone_number} successfully`);
          
        } catch (error) {
          console.error(`❌ Failed to update ${phoneNumber.phone_number}:`, error);
          updateResults.push({
            phoneNumber: phoneNumber.phone_number,
            phoneNumberId: phoneNumber.id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          errorCount++;
        }
      }
      
      // Show summary notification
      const notification = document.createElement('div');
      if (errorCount === 0) {
        notification.textContent = `Settings updated successfully!`;
        notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
      } else if (successCount > 0) {
        notification.textContent = `Settings partially updated. Some changes may not have been applied.`;
        notification.className = 'fixed top-4 right-4 bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 max-w-sm';
      } else {
        throw new Error(`Failed to update settings`);
      }
      
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 5000);
      
      console.log('📊 Update Summary:', {
        total: phoneNumbers.length,
        successful: successCount,
        failed: errorCount,
        details: updateResults
      });
      
    } catch (error) {
      console.error('❌ Failed to publish configuration:', error);
      
      // Show error notification
      const notification = document.createElement('div');
      notification.textContent = `Failed to update settings. Please try again.`;
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 max-w-sm';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 5000);
    } finally {
      setIsPublishing(false);
    }
  };

  const fetchAvailableNumbers = async () => {
    setIsLoadingNumbers(true);
    try {
      const response = await fetch('/api/telnyx-numbers');
      if (!response.ok) {
        throw new Error('Failed to fetch phone numbers');
      }
      const data = await response.json();
      setAvailableNumbers(data.phone_numbers || []);
      console.log('📱 Available phone numbers:', data.phone_numbers?.length || 0);
    } catch (error) {
      console.error('Error fetching phone numbers:', error);
      // Show error notification
      const notification = document.createElement('div');
      notification.textContent = 'Failed to load phone numbers. Please try again.';
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 3000);
    } finally {
      setIsLoadingNumbers(false);
    }
  };



  const assignPhoneNumber = async () => {
    if (!selectedNumber) return;
    
    setIsAssigningNumber(true);
    
    try {
      // Here you would typically make an API call to purchase/assign the number
      // For now, we'll simulate the assignment
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setAssignedPhoneNumber(selectedNumber.number);
      setShowTelephonyModal(false);
      setSelectedNumber(null);
      
      // Show success notification
      const notification = document.createElement('div');
      notification.textContent = `Phone number assigned successfully!`;
      notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 max-w-sm';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 4000);
      
    } catch (error) {
      console.error('Error assigning phone number:', error);
      
      // Show error notification
      const notification = document.createElement('div');
      notification.textContent = 'Failed to assign phone number. Please try again.';
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 3000);
    } finally {
      setIsAssigningNumber(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
  };

  const handleKeyDownInInput = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
  };



  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsGenerating(true);

    try {
      // Prepare messages for API
      const messagesToSend = [...messages, userMessage].map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Prepare current configuration context
      const configurationContext = {
        systemPrompt: projectConfig.systemPrompt,
        agentInstructions: projectConfig.agentInstructions,
        firstMessageMode: projectConfig.firstMessageMode,
        llmProvider: projectConfig.llmProvider,
        llmModel: projectConfig.llmModel,
        llmTemperature: projectConfig.llmTemperature,
        llmMaxResponseLength: projectConfig.llmMaxResponseLength,
        sttProvider: projectConfig.sttProvider,
        sttLanguage: projectConfig.sttLanguage,
        sttQuality: projectConfig.sttQuality,
        sttProcessingMode: projectConfig.sttProcessingMode,
        sttNoiseSuppression: projectConfig.sttNoiseSuppression,
        sttAutoPunctuation: projectConfig.sttAutoPunctuation,
        ttsProvider: projectConfig.ttsProvider,
        ttsVoice: projectConfig.ttsVoice,
        phoneNumber: projectConfig.phoneNumber,
        phoneInboundEnabled: projectConfig.phoneInboundEnabled,
        phoneOutboundEnabled: projectConfig.phoneOutboundEnabled,
        phoneRecordingEnabled: projectConfig.phoneRecordingEnabled,
        responseLatencyPriority: projectConfig.responseLatencyPriority,
        knowledgeBaseFiles: projectConfig.knowledgeBaseFiles,
        functionsEnabled: projectConfig.functionsEnabled,
        customFunctions: projectConfig.customFunctions,
        webhooksEnabled: projectConfig.webhooksEnabled,
        webhookUrl: projectConfig.webhookUrl,
        webhookEvents: projectConfig.webhookEvents
      };

      const response = await fetch('/api/config-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          messages: messagesToSend,
          configuration: configurationContext
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available');
      }

      let buffer = '';
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        checkpoint: true,
        filesSnapshot: createFilesSnapshot()
      };

      // Add the assistant message to state immediately
      setMessages(prev => [...prev, assistantMessage]);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Decode the chunk
          const chunk = new TextDecoder().decode(value);
          buffer += chunk;

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              
              if (data === '[DONE]') {
                console.log('Received [DONE] signal');
                break;
              }

              try {
                const parsed = JSON.parse(data);
                console.log('Parsed streaming data:', parsed);

                if (parsed.type === 'content_delta') {
                  // Update the assistant message content
                  assistantMessage.content = parsed.fullContent || '';
                  setMessages(prev => 
                    prev.map(msg => 
                      msg.id === assistantMessage.id 
                        ? { ...msg, content: assistantMessage.content }
                        : msg
                    )
                  );
                } else if (parsed.type === 'complete') {
                  console.log('Received complete signal, content length:', parsed.content?.length);
                  
                                    // Final update with complete content
                  assistantMessage.content = parsed.content || '';
                  assistantMessage.checkpoint = true;

                  setMessages(prev => 
                    prev.map(msg => 
                      msg.id === assistantMessage.id 
                        ? assistantMessage
                        : msg
                    )
                  );

                  // Handle configuration updates if present
                  if (parsed.configurationUpdates && Array.isArray(parsed.configurationUpdates)) {
                    console.log('Processing configuration updates:', parsed.configurationUpdates);
                    
                    // Apply configuration updates
                    setProjectConfig(prev => {
                      const newConfig = { ...prev };
                      
                      parsed.configurationUpdates.forEach((update: any) => {
                        if (update.field && update.value !== undefined) {
                          console.log(`Updating ${update.field} to:`, update.value);
                          (newConfig as any)[update.field] = update.value;
                        }
                      });
                      
                      return newConfig;
                    });

                    // Show notification about configuration updates
                    const updateCount = parsed.configurationUpdates.length;
                    const notification = document.createElement('div');
                    
                    // Create a more detailed notification
                    const updatedFields = parsed.configurationUpdates.map((update: any) => update.field).join(', ');
                    notification.innerHTML = `
                      <div class="flex items-center space-x-3">
                        <div class="w-6 h-6 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                          </svg>
                        </div>
                        <div>
                          <div class="font-medium">Configuration Updated</div>
                          <div class="text-sm opacity-90">Updated: ${updatedFields}</div>
                        </div>
                      </div>
                    `;
                    notification.className = 'fixed top-4 right-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-sm';
                    document.body.appendChild(notification);
                    setTimeout(() => {
                      if (document.body.contains(notification)) {
                        document.body.removeChild(notification);
                      }
                    }, 6000);
                  }

                } else if (parsed.type === 'error') {
                  console.error('Received error from stream:', parsed.error);
                  throw new Error(parsed.error);
                }
              } catch (parseError) {
                console.error('Error parsing streaming data:', parseError);
                console.error('Raw data that failed to parse:', data);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

    } catch (error) {
      console.error('Error sending message:', error);
      
      // Log more details about the error
      if (error instanceof Error) {
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      
      let errorContent = `Sorry, there was an error processing your request: ${error instanceof Error ? error.message : 'Unknown error'}`;
      
      // Check if it's an API key error
      if (error instanceof Error && error.message.includes('API key')) {
        errorContent = `⚠️ **Configuration Required**

The OpenAI API key is not configured. To use the configuration assistant:

1. Add your OpenAI API key to your environment variables:
   \`OPENAI_API_KEY=your_openai_api_key\`

2. Restart your development server

You can get an API key from: https://platform.openai.com/api-keys

For now, you can still manually configure your voice agent using the tabs above.`;
      }
      
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: errorContent,
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Rollback to a specific checkpoint
  const rollbackToCheckpoint = (checkpointMessage: ChatMessage) => {
    if (!checkpointMessage.filesSnapshot) return;
    
    // Restore files from checkpoint
    restoreFromCheckpoint(checkpointMessage.filesSnapshot);
    
    // Find the index of this checkpoint in messages
    const checkpointIndex = messages.findIndex(msg => msg.id === checkpointMessage.id);
    if (checkpointIndex !== -1) {
      // Remove all messages after this checkpoint
      const newMessages = messages.slice(0, checkpointIndex + 1);
      setMessages(newMessages);
      
      // Update available checkpoints
      const newCheckpoints = availableCheckpoints.filter(cp => 
        newMessages.some(msg => msg.id === cp.id)
      );
      setAvailableCheckpoints(newCheckpoints);
    }
    
    // showNotification(`Rolled back to checkpoint: ${checkpointMessage.timestamp.toLocaleString()}`, 'success');
    setShowCheckpointModal(false);
  };

  // Parse file operations from AI response - SIMPLIFIED AND RELIABLE
  const parseFileOperations = (content: string): Array<{type: 'CREATE' | 'UPDATE', filename: string, content: string}> => {
    console.log('=== PARSING FILE OPERATIONS ===');
    console.log('Content length:', content.length);
    
    const operations: Array<{type: 'CREATE' | 'UPDATE', filename: string, content: string}> = [];
    const lines = content.split('\n');
    
    // First, try the explicit format (CREATE_FILE:, UPDATE_FILE:)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Look for explicit file operation markers
      const createMatch = line.match(/^CREATE_FILE:\s*(.+)$/);
      const updateMatch = line.match(/^UPDATE_FILE:\s*(.+)$/);
      
      if (createMatch || updateMatch) {
        const type = createMatch ? 'CREATE' : 'UPDATE';
        const filename = (createMatch || updateMatch)![1].trim();
        
        console.log(`Found ${type} operation for: ${filename}`);
        
        // Find the next code block
        let codeBlockStart = -1;
        let codeBlockEnd = -1;
        
        // Look for opening ```
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim().startsWith('```')) {
            codeBlockStart = j;
            console.log(`Found code block start at line ${j}`);
            break;
          }
        }
        
        if (codeBlockStart === -1) {
          console.warn(`No code block found for ${type}:${filename}`);
          continue;
        }
        
        // Find the closing ```
        for (let j = codeBlockStart + 1; j < lines.length; j++) {
          if (lines[j].trim() === '```') {
            codeBlockEnd = j;
            console.log(`Found code block end at line ${j}`);
            break;
          }
        }
        
        if (codeBlockEnd === -1) {
          console.warn(`No closing code block found for ${type}:${filename}`);
          continue;
        }
        
        // Extract the code content
        const codeLines = lines.slice(codeBlockStart + 1, codeBlockEnd);
        const codeContent = codeLines.join('\n').trim();
        
        console.log(`Extracted code content: ${codeContent.length} characters`);
        
        // Validate content
        if (codeContent.length < 5) {
          console.warn(`Code content too short for ${filename}: ${codeContent.length} chars`);
          continue;
        }
        
        // Check for duplicates
        const duplicate = operations.find(op => op.filename === filename);
        if (duplicate) {
          console.warn(`Duplicate filename found: ${filename}, skipping`);
          continue;
        }
        
        // Add the operation
        operations.push({
          type: type as 'CREATE' | 'UPDATE',
          filename,
          content: codeContent
        });
        
        console.log(`✅ Successfully parsed ${type} operation for ${filename}`);
        
        // Skip ahead past the code block
        i = codeBlockEnd;
      }
    }
    
    // If no explicit operations found, try fallback parsing
    if (operations.length === 0) {
      console.log('No explicit operations found, trying fallback parsing...');
      
      // Look for "Files modified:" or "**Files modified:**" section
      let filesModifiedIndex = -1;
      const modifiedFiles: string[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.match(/\*?\*?Files? modified:?\*?\*?/i)) {
          filesModifiedIndex = i;
          console.log(`Found "Files modified" section at line ${i}`);
          
          // Parse the files listed after this
          for (let j = i + 1; j < lines.length; j++) {
            const fileLine = lines[j].trim();
            if (!fileLine) break; // Stop at empty line
            
            // Look for patterns like "- Updated: filename" or "- filename"
            const fileMatch = fileLine.match(/^-\s*(?:Updated?|Created?|Modified?)?\s*:?\s*(.+)$/i);
            if (fileMatch) {
              const filename = fileMatch[1].trim();
              modifiedFiles.push(filename);
              console.log(`Found modified file: ${filename}`);
            }
          }
          break;
        }
      }
      
      // If we found modified files, try to match them with code blocks
      if (modifiedFiles.length > 0) {
        console.log(`Found ${modifiedFiles.length} modified files, looking for code blocks...`);
        
        // Find all code blocks in the content
        const codeBlocks: Array<{start: number, end: number, language: string, content: string}> = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith('```')) {
            const language = line.substring(3).trim();
            let endIndex = -1;
            
            // Find closing ```
            for (let j = i + 1; j < lines.length; j++) {
              if (lines[j].trim() === '```') {
                endIndex = j;
                break;
              }
            }
            
            if (endIndex !== -1) {
              const content = lines.slice(i + 1, endIndex).join('\n').trim();
              codeBlocks.push({
                start: i,
                end: endIndex,
                language,
                content
              });
              console.log(`Found code block (${language}): ${content.length} chars`);
            }
          }
        }
        
        // Try to match files with code blocks
        for (const filename of modifiedFiles) {
          const fileExt = filename.split('.').pop()?.toLowerCase() || '';
          
          // Find the best matching code block
          let bestMatch = -1;
          let bestScore = 0;
          
          for (let i = 0; i < codeBlocks.length; i++) {
            const block = codeBlocks[i];
            let score = 0;
            
            // Score based on language match
            if (fileExt === 'py' && block.language === 'python') score += 10;
            if (fileExt === 'js' && (block.language === 'javascript' || block.language === 'js')) score += 10;
            if (fileExt === 'ts' && (block.language === 'typescript' || block.language === 'ts')) score += 10;
            if (fileExt === 'tsx' && (block.language === 'tsx' || block.language === 'typescript')) score += 10;
            
            // Score based on proximity (closer to files modified section = higher score)
            if (filesModifiedIndex !== -1) {
              const distance = Math.abs(block.start - filesModifiedIndex);
              score += Math.max(0, 100 - distance); // Closer = higher score
            }
            
            // Score based on content size (reasonable size gets bonus)
            if (block.content.length > 50 && block.content.length < 10000) {
              score += 5;
            }
            
            if (score > bestScore) {
              bestScore = score;
              bestMatch = i;
            }
          }
          
          if (bestMatch !== -1 && bestScore > 0) {
            const block = codeBlocks[bestMatch];
        operations.push({
              type: 'UPDATE', // Default to UPDATE for fallback parsing
          filename,
              content: block.content
            });
            console.log(`✅ Matched ${filename} with code block (score: ${bestScore})`);
            
            // Remove the matched block to avoid double-matching
            codeBlocks.splice(bestMatch, 1);
          } else {
            console.warn(`❌ Could not match ${filename} with any code block`);
          }
        }
      }
    }
    
    console.log('=== PARSING COMPLETE ===');
    console.log(`Found ${operations.length} file operations:`);
    operations.forEach(op => {
      console.log(`  - ${op.type}: ${op.filename} (${op.content.length} chars)`);
    });
    
    return operations;
  };

  // Function to save agent configuration to database (simplified - no longer using agent-config API)
  const saveAgentConfiguration = async (projectToUse?: Project, userToUse?: { id: string }): Promise<string | null> => {
    console.log('[DEBUG] ========= Starting saveAgentConfiguration =========');
    console.log('[DEBUG] Config:', config);
    console.log('[DEBUG] CurrentCode length:', currentCode?.length || 0);

    const finalCode = currentCode || code;
    const projectToSave = projectToUse || currentProject;
    const userToSave = userToUse || user;

    try {
      const project = projectToSave;
      const userForConfig = userToSave;

      if (!project || !userForConfig) {
        console.error('❌ Missing required data for saving agent configuration:', {
          hasProject: !!project,
          hasUser: !!userForConfig
        });
        return null;
      }

      console.log('💾 Agent configuration saved locally (API removed)');
      
      // Generate a mock configuration ID
      const configId = `config_${Date.now()}`;
        console.log('✅ Agent configuration saved successfully:', configId);
        setCurrentConfigurationId(configId);
        await loadAgentConfigurations();
        return configId;
    } catch (error) {
      console.error('❌ Error saving agent configuration:', error);
      return null;
    }
  };

  const startConversation = async () => {
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

      // Create explicit agent dispatch for this room
      console.log('🤖 Creating explicit agent dispatch...');
      const agentMetadata = {
        projectId: projectToUse.id,
        configurationId: currentConfigurationId,
        agentConfig: {
          ...config,
          prompt: projectConfig.systemPrompt || config.prompt // Use AI-generated system prompt if available, fallback to original
        },
        modelConfigurations: {
          // LLM Configuration
          llm: {
            provider: projectConfig.llmProvider,
            model: projectConfig.llmModel,
            temperature: projectConfig.llmTemperature,
            maxResponseLength: projectConfig.llmMaxResponseLength
          },
          // STT Configuration
          stt: {
            provider: projectConfig.sttProvider,
            language: projectConfig.sttLanguage,
            quality: projectConfig.sttQuality,
            processingMode: projectConfig.sttProcessingMode,
            noiseSuppression: projectConfig.sttNoiseSuppression,
            autoPunctuation: projectConfig.sttAutoPunctuation
          },
          // TTS Configuration
          tts: {
            provider: projectConfig.ttsProvider,
            voice: projectConfig.ttsVoice
          },
          // Additional configurations
          firstMessageMode: projectConfig.firstMessageMode,
          responseLatencyPriority: projectConfig.responseLatencyPriority
        }
      };

      console.log('📋 Agent dispatch metadata:');
      console.log('   • Project ID:', projectToUse.id);
      console.log('   • Configuration ID:', currentConfigurationId);
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
            metadata: agentMetadata
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
        notification.className = 'fixed top-4 right-4 bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
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
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 max-w-sm';
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
  };

  const endConversation = async () => {
    await room.disconnect();
    setIsInConversation(false);
  };

  // Room event handling
  useEffect(() => {
    const onDeviceFailure = (error: Error) => {
      console.error('Device failure:', error);
      const notification = document.createElement('div');
      notification.textContent = 'Error accessing microphone. Please check permissions and reload.';
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
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

  // Voice Assistant Components
  function SimpleVoiceAssistant() {
    const { state: agentState } = useVoiceAssistant();

    return (
      <>
        <AnimatePresence mode="wait">
          {agentState === "disconnected" ? (
            <motion.div
              key="disconnected"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, ease: [0.09, 1.04, 0.245, 1.055] }}
              className="grid items-center justify-center h-full"
            >
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-lg"
                onClick={() => startConversation()}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2 inline-block"></div>
                    Creating Agent Session...
                  </>
                ) : (
                  'Start Conversation'
                )}
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="connected"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: [0.09, 1.04, 0.245, 1.055] }}
              className="flex flex-col items-center gap-4 h-full bg-gray-900"
              style={{ '--lk-bg': '#111827' } as React.CSSProperties}
            >
        <AgentVisualizer />
        <div className="flex-1 w-full bg-gray-900">
          <TranscriptionView />
        </div>
        <div className="w-full bg-gray-900">
          <ConversationControlBar />
        </div>
        <RoomAudioRenderer />
        <NoAgentNotification state={agentState} />
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  function AgentVisualizer() {
    const { state: agentState, videoTrack, audioTrack } = useVoiceAssistant();

    if (videoTrack) {
      return (
        <div className="h-[512px] w-[512px] rounded-lg overflow-hidden bg-gray-900">
          <VideoTrack trackRef={videoTrack} />
        </div>
      );
    }
    return (
      <div className="h-[300px] w-full bg-gray-900">
        <BarVisualizer
          state={agentState}
          barCount={5}
          trackRef={audioTrack}
          className="agent-visualizer"
          options={{ minHeight: 24 }}
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
              className="flex h-8 absolute left-1/2 -translate-x-1/2 justify-center items-center space-x-4"
              style={{
                '--lk-button-disconnect-bg': 'white',
                '--lk-button-disconnect-bg-hover': 'white',
                '--lk-button-bg': 'white',
                '--lk-button-bg-hover': 'white',
                '--lk-fg': 'black',
                '--lk-fg-contrast': 'white',
                '--lk-mic-button-bg': 'white',
                '--lk-mic-button-bg-hover': 'white',
                '--lk-control-bg': 'white',
                '--lk-control-bg-hover': 'white'
              } as React.CSSProperties}
            >
              <VoiceAssistantControlBar controls={{ leave: false }} />
              <DisconnectButton 
                onClick={endConversation}
                style={{ 
                  backgroundColor: 'white',
                  borderColor: 'white'
                }}
                className="!bg-red-600 hover:!bg-red-700 !border-red-600 hover:!border-red-700"
              >
                <CloseIcon />
              </DisconnectButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Clear any existing timeouts on component mount to prevent cached timeout callbacks
  useEffect(() => {
    // Clear all existing timeouts that might have been set before the UUID fix
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      console.log('🧹 Cleared any existing save timeouts on component mount');
    }
    
    // Force a cleanup of any stale timeout references
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        console.log('🧹 Cleaned up save timeout on component unmount');
      }
    };
  }, []); // Empty dependency array means this runs once on mount

  // Dynamic provider mapping based on model
  const modelProviderMapping: { [key: string]: string } = {
    'gpt-4o-mini': 'openai',
    'gpt-4o': 'openai',
    'gpt-4.1': 'openai',
    'gpt-4.1-mini': 'openai',
    'gpt-4.1-nano': 'openai',
    'claude-opus-4': 'anthropic',
    'claude-sonnet-4': 'anthropic',
    'claude-3-5-haiku': 'anthropic'
  };

  const providers = [
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' }
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
      { value: 'claude-opus-4', label: 'Claude Opus 4' },
      { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
      { value: 'claude-3-5-haiku', label: 'Claude 3.5 Haiku' }
    ]
  };

  const firstMessageModeOptions = [
    { value: 'greeting', label: 'Assistant speaks first' },
    { value: 'wait', label: 'Wait for User' },
    { value: 'custom', label: 'Custom' }
  ];

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    // Automatically update provider based on model
    const provider = modelProviderMapping[model] || 'openai';
    setSelectedProvider(provider);
  };

  return (
    <RoomContext.Provider value={room}>
      <div className="w-full h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex" style={{ fontFamily: 'Helvetica, "Helvetica Neue", Arial, sans-serif' }}>
        {/* Left side - Chat conversation */}
        <div className="w-1/4 bg-gray-800 border-r border-gray-700 flex flex-col">
          {/* Header with logo */}
          <div className="p-3 border-b border-gray-700 bg-gray-800">
            <div className="flex items-center justify-between">
              <button
                onClick={onBackToHome}
                className="hover:opacity-80 transition-opacity cursor-pointer"
                title="Go to home page"
              >
                <img 
                  src="/VoiceBun-BunOnly.png" 
                  alt="VoiceBun" 
                  className="w-10 h-10"
                />
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
            {messages.map((message) => (
              <div key={message.id} className="flex flex-col items-start">
                {message.role === 'assistant' && (
                  <div className="mb-2">
                    <p className="text-sm font-black text-white" style={{ fontWeight: '900', fontFamily: 'Helvetica, "Helvetica Neue", Arial, sans-serif' }}>Bun</p>
                  </div>
                )}
                {message.role === 'user' && (
                  <div className="mb-2">
                    <p className="text-sm font-black text-white" style={{ fontWeight: '900', fontFamily: 'Helvetica, "Helvetica Neue", Arial, sans-serif' }}>You</p>
                  </div>
                )}
                <div className="max-w-[95%]">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-gray-200">{message.content}</p>
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-xs opacity-70 text-gray-400">
                      {message.timestamp.toLocaleTimeString()}
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
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-400 border-t-transparent"></div>
                    <span className="text-sm text-gray-200">Thinking...</span>
                  </div>
                </div>
              </div>
            )}


          </div>

          {/* Message input */}
          <div className="p-6 border-t border-gray-700 bg-gray-800">
            <div className="relative bg-gray-700 rounded-3xl p-4">
              <div className="flex items-center space-x-3">
                <button className="w-8 h-8 bg-white hover:bg-gray-100 rounded-full flex items-center justify-center transition-colors">
                  <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                </button>
                
                
                <div className="flex-1">
                  <textarea
                    value={inputMessage}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDownInInput}
                    placeholder="Ask Bun"
                    className="w-full bg-transparent text-white placeholder-gray-400 focus:outline-none resize-none text-base leading-relaxed"
                    rows={1}
                    disabled={isGenerating}
                    style={{
                      minHeight: '24px',
                      maxHeight: '120px',
                      height: 'auto'
                    }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                    }}
                  />
                </div>
                

                
                <button
                  onClick={sendMessage}
                  disabled={!inputMessage.trim() || isGenerating}
                  className="w-8 h-8 bg-white hover:bg-gray-100 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-colors"
                >
                  <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Code/Test view */}
        <div className="w-3/4 bg-black flex flex-col">
          {/* Header with toggle and actions */}
          <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
            <div className="flex items-center space-x-6">
                <button
                onClick={() => setActiveMenu('instructions')}
                className={`text-base font-bold transition-colors relative ${
                  activeMenu === 'instructions' 
                    ? 'text-white' 
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                Instructions
                {activeMenu === 'instructions' && (
                  <div className="absolute -bottom-4 left-0 right-0 h-0.5 bg-white"></div>
                )}
                </button>
                <button
                onClick={() => setActiveMenu('models')}
                className={`text-base font-bold transition-colors relative ${
                  activeMenu === 'models' 
                    ? 'text-white' 
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                Models
                {activeMenu === 'models' && (
                  <div className="absolute -bottom-4 left-0 right-0 h-0.5 bg-white"></div>
                )}
                </button>
                <button
                onClick={() => setActiveMenu('functions')}
                className={`text-base font-bold transition-colors relative ${
                  activeMenu === 'functions' 
                    ? 'text-white' 
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                Functions
                {activeMenu === 'functions' && (
                  <div className="absolute -bottom-4 left-0 right-0 h-0.5 bg-white"></div>
                )}
                </button>
                  <button
                onClick={() => setActiveMenu('phone')}
                className={`text-base font-bold transition-colors relative ${
                  activeMenu === 'phone' 
                    ? 'text-white' 
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                Phone Numbers
                {activeMenu === 'phone' && (
                  <div className="absolute -bottom-4 left-0 right-0 h-0.5 bg-white"></div>
                )}
                </button>
                  <button
                onClick={() => setActiveMenu('other')}
                className={`text-base font-bold transition-colors relative ${
                  activeMenu === 'other' 
                    ? 'text-white' 
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                Other
                {activeMenu === 'other' && (
                  <div className="absolute -bottom-4 left-0 right-0 h-0.5 bg-white"></div>
                )}
                </button>
                <button
                onClick={() => {
                  console.log('🔄 Test tab clicked from navigation');
                  setActiveMenu('test');
                }}
                className={`text-base font-bold transition-colors relative ${
                  activeMenu === 'test' 
                    ? 'text-white' 
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                Test
                {activeMenu === 'test' && (
                  <div className="absolute -bottom-4 left-0 right-0 h-0.5 bg-white"></div>
                )}
                        </button>
                      </div>
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={saveProjectConfiguration}
                        disabled={isSavingConfig}
                        className="px-4 py-1.5 bg-white hover:bg-gray-100 disabled:bg-gray-300 disabled:cursor-not-allowed text-black text-sm font-medium rounded-lg transition-colors flex items-center space-x-2"
              >
                        {isSavingConfig ? (
                          <>
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-black"></div>
                            <span>Saving...</span>
                          </>
                        ) : (
                          <span>Save</span>
                        )}
                      </button>

                      <button 
                        onClick={handlePublish}
                        disabled={isPublishing}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-500 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center space-x-2"
                      >
                        {isPublishing ? (
                          <>
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                            <span>Publishing...</span>
                          </>
                        ) : (
                          <span>Publish</span>
                        )}
                      </button>
                      </div>
                  </div>

          {/* Content area */}
          <div className="flex-1 overflow-hidden">
            {activeMenu === 'test' ? (
              <div className="h-full flex flex-col">
                {/* Test area - Show voice interface if connected, otherwise show start button */}
                <div className="flex-1 bg-gray-900">
                  {isInConversation ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 bg-gray-900">
                      <SimpleVoiceAssistant />
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center space-y-6 p-8 max-w-md mx-auto">
                        <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto">
                          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                        </div>
                        <div className="flex flex-col items-center">
                          <h3 className="text-2xl font-semibold text-white mb-3">Ready to Test</h3>
                          <p className="text-gray-400 mb-6">Your voice agent is configured and ready for testing. Make sure your backend agent is running.</p>
                          <button
                            onClick={(e) => {
                              console.log('🖱️ BUTTON CLICKED! Event details:');
                              console.log('   • Event type:', e.type);
                              console.log('   • Button disabled:', isConnecting);
                              console.log('   • Current isInConversation:', isInConversation);
                              
                              e.preventDefault();
                              e.stopPropagation();
                              
                              console.log('🚀 About to call startConversation()...');
                              startConversation().catch(err => {
                                console.error('🔥 Unhandled error in startConversation:', err);
                              });
                            }}
                            disabled={isConnecting}
                            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-lg flex items-center justify-center mx-auto"
                          >
                            {isConnecting ? (
                              <>
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                                Connecting...
                              </>
                            ) : (
                              'Start Conversation'
                            )}
                          </button>
                        </div>
                        
                        <div className="border-t border-gray-700 pt-6">
                          <h4 className="text-md font-medium text-white mb-3">Testing Tips</h4>
                          <ul className="text-gray-400 text-sm space-y-2 text-left">
                            <li>• Speak clearly and wait for the agent to respond</li>
                            <li>• Try asking questions related to your agent&apos;s purpose</li>
                            <li>• Test different conversation scenarios</li>
                            <li>• Use the chat on the left to modify the agent&apos;s behavior</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : activeMenu === 'instructions' ? (
              <div className="h-full bg-black p-6 overflow-y-auto">
                <div className="max-w-4xl mx-auto space-y-8">
                  {/* System Prompt Section */}
                  <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
                      <svg className="w-6 h-6 mr-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      System Prompt
                    </h3>
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="block text-sm font-medium text-gray-200">
                          Define your agent's behavior and personality
                        </label>
                        <button className="flex items-center space-x-2 px-3 py-1.5 bg-white hover:bg-gray-100 text-black text-sm font-medium rounded-lg transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span>AI Assistant</span>
                        </button>
                      </div>
                      
                      <textarea 
                        rows={8}
                        value={projectConfig.systemPrompt}
                        onChange={(e) => setProjectConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        placeholder="Enter your system prompt here. For example: 'You are a helpful customer service representative for an e-commerce company. You should be friendly, professional, and knowledgeable about products and policies. Always aim to resolve customer issues efficiently while maintaining a positive tone.'"
                      />
                    </div>
                  </div>

                  {/* RAG Data Upload Section */}
                  <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
                      <svg className="w-6 h-6 mr-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                                             Knowledge Base
                    </h3>
                    
                    <div className="space-y-6">
                      <p className="text-gray-300">
                        Upload files to give your agent access to specific knowledge and data. Supported formats: PDF, TXT, DOCX, CSV, JSON.
                      </p>
                      
                      {/* File Upload Area */}
                      <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-gray-500 transition-colors">
                        <div className="space-y-4">
                          <div className="mx-auto w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center">
                            <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-white font-medium">Drop files here or click to browse</p>
                            <p className="text-gray-400 text-sm">Maximum file size: 10MB per file</p>
                          </div>
                          <input
                            type="file"
                            multiple
                            accept=".pdf,.txt,.docx,.csv,.json"
                            className="hidden"
                            id="file-upload"
                          />
                          <label
                            htmlFor="file-upload"
                            className="inline-flex items-center px-4 py-2 bg-white hover:bg-gray-100 text-black font-medium rounded-lg cursor-pointer transition-colors"
                          >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Choose Files
                          </label>
                        </div>
                      </div>
                      
                                             {/* Uploaded Files List */}
                       <div className="space-y-3">
                         <h4 className="text-lg font-medium text-white">Uploaded Files</h4>
                         <div className="text-center py-8">
                           <p className="text-gray-400">No files uploaded yet</p>
                           <p className="text-gray-500 text-sm mt-1">Upload files to enhance your agent's knowledge</p>
                         </div>
                       </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : activeMenu === 'models' ? (
              <div className="h-full bg-black p-6 overflow-y-auto">
                <div className="max-w-4xl mx-auto space-y-8">
                  {/* Base Model Configuration */}
                  <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
                      <svg className="w-6 h-6 mr-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Base Model
                    </h3>
                    
                    <div className="space-y-6">
                      <p className="text-gray-400">
                        Choose the AI model that will power your voice agent's conversations and responses.
                      </p>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Provider Selection */}
                      <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-300">
                          Provider
                        </label>
                          <div className="relative">
                            <select 
                              value={projectConfig.llmProvider}
                              onChange={(e) => {
                                setProjectConfig(prev => ({ ...prev, llmProvider: e.target.value as any }));
                                setSelectedProvider(e.target.value);
                              }}
                              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer transition-all duration-200 hover:bg-gray-650 pr-10"
                            >
                              {providers.map(provider => (
                                <option key={provider.value} value={provider.value} className="bg-gray-700 text-white">
                                  {provider.label}
                                </option>
                              ))}
                        </select>
                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                      </div>

                        {/* Model Selection */}
                      <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-300">
                          Model
                        </label>
                          <div className="relative">
                            <select 
                              value={projectConfig.llmModel}
                              onChange={(e) => {
                                setProjectConfig(prev => ({ ...prev, llmModel: e.target.value }));
                                handleModelChange(e.target.value);
                              }}
                              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer transition-all duration-200 hover:bg-gray-650 pr-10"
                            >
                              {modelsByProvider[projectConfig.llmProvider]?.map(model => (
                                <option key={model.value} value={model.value} className="bg-gray-700 text-white">
                                  {model.label}
                                </option>
                              ))}
                        </select>
                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                      </div>

                        {/* Temperature */}
                      <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-300">
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
                              className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                            />
                            <div className="flex justify-between text-xs text-gray-400">
                              <span>Conservative (0)</span>
                              <span>Balanced (1)</span>
                              <span>Creative (2)</span>
                            </div>
                          </div>
                        </div>

                        {/* Max Tokens */}
                        <div className="space-y-3">
                          <label className="block text-sm font-medium text-gray-300">
                            Max Response Length
                          </label>
                          <div className="relative">
                            <select 
                              value={projectConfig.llmMaxResponseLength}
                              onChange={(e) => setProjectConfig(prev => ({ ...prev, llmMaxResponseLength: parseInt(e.target.value) as any }))}
                              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer transition-all duration-200 hover:bg-gray-650 pr-10"
                            >
                              <option value="150" className="bg-gray-700 text-white">Short (150 tokens)</option>
                              <option value="300" className="bg-gray-700 text-white">Medium (300 tokens)</option>
                              <option value="500" className="bg-gray-700 text-white">Long (500 tokens)</option>
                              <option value="1000" className="bg-gray-700 text-white">Very Long (1000 tokens)</option>
                        </select>
                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Transcriber Configuration */}
                  <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
                      <svg className="w-6 h-6 mr-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      Speech-to-Text (Transcriber)
                    </h3>
                    
                    <div className="space-y-6">
                      <p className="text-gray-400">
                        Configure how your agent converts speech to text for processing.
                      </p>
                      
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Transcriber Provider */}
                        <div className="space-y-3">
                          <label className="block text-sm font-medium text-gray-300">
                            Transcriber Provider
                          </label>
                          <div className="bg-gray-700 border border-gray-600 rounded-xl px-4 py-3">
                            <span className="text-white">Deepgram</span>
                          </div>
                      </div>

                      {/* Language */}
                      <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-300">
                          Language
                        </label>
                          <div className="relative">
                            <select 
                              value={projectConfig.sttLanguage}
                              onChange={(e) => setProjectConfig(prev => ({ ...prev, sttLanguage: e.target.value as any }))}
                              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer transition-all duration-200 hover:bg-gray-650 pr-10"
                            >
                              <option value="en" className="bg-gray-700 text-white">English</option>
                              <option value="es" className="bg-gray-700 text-white">Spanish</option>
                              <option value="fr" className="bg-gray-700 text-white">French</option>
                              <option value="de" className="bg-gray-700 text-white">German</option>
                              <option value="it" className="bg-gray-700 text-white">Italian</option>
                              <option value="pt" className="bg-gray-700 text-white">Portuguese</option>
                              <option value="ja" className="bg-gray-700 text-white">Japanese</option>
                              <option value="ko" className="bg-gray-700 text-white">Korean</option>
                              <option value="zh" className="bg-gray-700 text-white">Chinese</option>
                        </select>
                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                      </div>

                        {/* Model Quality */}
                      <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-300">
                            Transcription Quality
                        </label>
                          <div className="relative">
                            <select 
                              value={projectConfig.sttQuality}
                              onChange={(e) => setProjectConfig(prev => ({ ...prev, sttQuality: e.target.value as any }))}
                              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer transition-all duration-200 hover:bg-gray-650 pr-10"
                            >
                              <option value="standard" className="bg-gray-700 text-white">Standard (Faster, Lower Cost)</option>
                              <option value="enhanced" className="bg-gray-700 text-white">Enhanced (Balanced)</option>
                              <option value="premium" className="bg-gray-700 text-white">Premium (Highest Accuracy)</option>
                        </select>
                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                      </div>
                    </div>


                    </div>

                      {/* Advanced Transcription Settings */}
                      <div className="space-y-4">
                        <h4 className="text-lg font-medium text-white">Advanced Settings</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
                            <div>
                              <span className="text-gray-300 font-medium">Noise Suppression</span>
                              <p className="text-gray-400 text-sm">Reduce background noise</p>
                            </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="sr-only peer" 
                              checked={projectConfig.sttNoiseSuppression}
                              onChange={(e) => setProjectConfig(prev => ({ ...prev, sttNoiseSuppression: e.target.checked }))}
                            />
                            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>
                        
                          <div className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
                            <div>
                              <span className="text-gray-300 font-medium">Punctuation</span>
                              <p className="text-gray-400 text-sm">Auto-add punctuation</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={projectConfig.sttAutoPunctuation}
                                onChange={(e) => setProjectConfig(prev => ({ ...prev, sttAutoPunctuation: e.target.checked }))}
                              />
                              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Voice Configuration */}
                  <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
                      <svg className="w-6 h-6 mr-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      </svg>
                      Text-to-Speech (Voice)
                    </h3>
                    
                    <div className="space-y-6">
                      <p className="text-gray-400">
                        Configure how your agent's responses are converted to speech.
                      </p>
                      
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Voice Provider */}
                        <div className="space-y-3">
                          <label className="block text-sm font-medium text-gray-300">
                            Voice Provider
                          </label>
                          <div className="relative">
                            <select 
                              value={projectConfig.ttsProvider}
                              onChange={(e) => setProjectConfig(prev => ({ ...prev, ttsProvider: e.target.value as any }))}
                              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer transition-all duration-200 hover:bg-gray-650 pr-10"
                            >
                              <option value="cartesia" className="bg-gray-700 text-white">Cartesia</option>
                              <option value="elevenlabs" className="bg-gray-700 text-white">ElevenLabs</option>
                              <option value="openai" className="bg-gray-700 text-white">OpenAI</option>
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                        </div>

                        {/* Voice Selection */}
                        <div className="space-y-3">
                          <label className="block text-sm font-medium text-gray-300">
                            Voice
                          </label>
                          <div className="relative">
                            <select 
                              value={projectConfig.ttsVoice}
                              onChange={(e) => setProjectConfig(prev => ({ ...prev, ttsVoice: e.target.value as any }))}
                              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer transition-all duration-200 hover:bg-gray-650 pr-10"
                            >
                              <option value="neutral" className="bg-gray-700 text-white">Neutral</option>
                              <option value="male" className="bg-gray-700 text-white">Male</option>
                              <option value="british_male" className="bg-gray-700 text-white">British Male</option>
                              <option value="deep_male" className="bg-gray-700 text-white">Deep Male</option>
                              <option value="female" className="bg-gray-700 text-white">Female</option>
                              <option value="soft_female" className="bg-gray-700 text-white">Soft Female</option>
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                        </div>


                      </div>

                      {/* Voice Preview */}
                      <div className="bg-gray-700 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-lg font-medium text-white">Voice Preview</h4>
                          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center space-x-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m2 4H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>Test Voice</span>
                          </button>
                        </div>
                        <textarea
                          rows={3}
                          placeholder="Enter text to preview the voice..."
                          defaultValue="Hello! I'm your AI voice assistant. How can I help you today?"
                          className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                      </div>
                    </div>
                  </div>




                </div>
              </div>
            ) : activeMenu === 'functions' ? (
              <div className="h-full bg-gray-900 p-6 overflow-y-auto">
                <div className="max-w-4xl mx-auto space-y-8">
                  <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
                      <svg className="w-6 h-6 mr-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      Functions & Tools
                    </h3>
                      
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        </div>
                      <h4 className="text-xl font-semibold text-white mb-2">Functions & Tools</h4>
                      <p className="text-gray-400">Configure custom functions and integrations for your voice agent.</p>
                      <p className="text-gray-500 text-sm mt-2">Coming soon...</p>
                      </div>
                    </div>
                </div>
              </div>
            ) : activeMenu === 'phone' ? (
              <div className="h-full bg-gray-900 p-6 overflow-y-auto">
                <div className="max-w-4xl mx-auto space-y-8">
                  <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
                      <svg className="w-6 h-6 mr-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      Phone Numbers
                    </h3>
                    
                    <div className="space-y-6">
                      <p className="text-gray-300">
                        Configure phone numbers for your voice agent to handle inbound and outbound calls.
                      </p>
                      
                      {/* Phone Number Manager */}
                      <div className="bg-gray-700 rounded-lg p-4">
                        <PhoneNumberManager
                          key={phoneNumberRefreshKey}
                          projectId={project?.id || currentProject?.id}
                          onPhoneNumberAssigned={(phoneNumber, phoneNumberId) => {
                            setAssignedPhoneNumber(phoneNumber);
                            setAssignedPhoneNumberId(phoneNumberId);
                            // Update project config with the assigned phone number
                            setProjectConfig(prev => ({ ...prev, phoneNumber }));
                          }}
                          onPurchaseNumber={() => setShowTelnyxNumbersModal(true)}
                        />
                      </div>
                      
                      {/* Phone Number Settings */}
                        <div className="bg-gray-700 rounded-lg p-4">
                        <h4 className="text-lg font-medium text-white mb-4">Call Settings</h4>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-white font-medium">Inbound Calls</p>
                              <p className="text-gray-400 text-sm">Allow incoming calls to this number</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" className="sr-only peer" defaultChecked />
                              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-white font-medium">Outbound Calls</p>
                              <p className="text-gray-400 text-sm">Allow agent to make outgoing calls</p>
                              <p className="text-gray-500 text-xs mt-1">Coming Soon</p>
                      </div>
                            <label className="relative inline-flex items-center cursor-pointer opacity-50 cursor-not-allowed">
                              <input type="checkbox" className="sr-only peer" disabled />
                              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>
                        
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-white font-medium">Call Recording</p>
                              <p className="text-gray-400 text-sm">Record all conversations for quality assurance</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" className="sr-only peer" defaultChecked />
                              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                          </div>
                        </div>
                        </div>
                        



                        </div>
                        </div>
                </div>
              </div>
            ) : activeMenu === 'other' ? (
              <div className="h-full bg-gray-900 p-6 overflow-y-auto">
                <div className="max-w-4xl mx-auto space-y-8">
                  <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
                      <svg className="w-6 h-6 mr-3 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                      </svg>
                      Other Settings
                    </h3>
                    
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                        </svg>
                        </div>
                      <h4 className="text-xl font-semibold text-white mb-2">Other Settings</h4>
                      <p className="text-gray-400">Additional configuration options and advanced settings.</p>
                      <p className="text-gray-500 text-sm mt-2">Coming soon...</p>
                      </div>
                    </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center bg-gray-900">
                <div className="text-center">
                  <p className="text-gray-400">Select a configuration section above or click Test to test your voice agent</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Telnyx Numbers Modal */}
      <TelnyxNumbersModal
        isOpen={showTelnyxNumbersModal}
        onClose={() => setShowTelnyxNumbersModal(false)}
        onSelectNumber={(phoneNumber) => {
          // Trigger a refresh of the phone number list
          setPhoneNumberRefreshKey(prev => prev + 1);
          setShowTelnyxNumbersModal(false);
        }}
        userId={user?.id}
        projectId={project?.id || currentProject?.id}
      />
    </RoomContext.Provider>
  );
} 