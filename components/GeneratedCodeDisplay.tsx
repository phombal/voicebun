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
  const [activeMenu, setActiveMenu] = useState<'instructions' | 'models' | 'phone' | 'other'>('instructions');
  const [showMobileMenu, setShowMobileMenu] = useState(false);

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
    llmProvider: 'openai' as 'openai' | 'anthropic' | 'google' | 'azure' | 'xai',
    llmModel: 'gpt-4o-mini',
    llmTemperature: 0.7,
    llmMaxResponseLength: 300 as 150 | 300 | 500 | 1000,
    sttProvider: 'deepgram' as 'deepgram',
    sttLanguage: 'en' as 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ja' | 'ko' | 'zh',
    sttQuality: 'enhanced' as 'standard' | 'enhanced' | 'premium',
    sttProcessingMode: 'streaming' as 'streaming' | 'batch',
    sttNoiseSuppression: true,
    sttAutoPunctuation: true,
    ttsProvider: 'cartesia' as 'cartesia' | 'openai',
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);





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
          ttsProvider: (projectData.tts_provider as any) === 'elevenlabs' ? 'cartesia' : projectData.tts_provider,
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
      notification.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
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
        notification.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
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
        notification.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
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
      notification.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
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
    // Remove this effect since we no longer have a test tab
    // The conversation can continue while user navigates between config tabs
  }, []);



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
      notification.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
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
      notification.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 3000);
    }
  };

  const handlePublish = async () => {
    console.log('🚀 Publishing voice agent...');
    
    const projectToUse = project || currentProject;
    if (!projectToUse) {
      console.error('❌ No project selected for publishing');
      
      // Show error notification
      const notification = document.createElement('div');
      notification.textContent = 'Please select a project to publish.';
      notification.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 5000);
      return;
    }

    setIsPublishing(true);
    
    try {
      // First, automatically save the configuration
      console.log('💾 Auto-saving configuration before publishing...');
      await saveProjectConfiguration();
      console.log('✅ Configuration saved successfully');
      
      // Get phone numbers for this project
      console.log('📞 Fetching phone numbers for project:', projectToUse.id);
      const phoneNumbers = await getProjectPhoneNumbers(projectToUse.id);
      console.log('📞 Found phone numbers:', phoneNumbers?.length || 0);
      
      if (!phoneNumbers || phoneNumbers.length === 0) {
        console.log('⚠️ No phone numbers found for project');
        
        // Show notification to purchase phone number
        const notification = document.createElement('div');
        notification.innerHTML = `
          <div>
            <strong>No phone number connected</strong><br>
            Please purchase a phone number first to publish your voice agent.
          </div>
        `;
        notification.className = 'fixed bottom-4 right-4 bg-yellow-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        document.body.appendChild(notification);
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
        }, 7000);
        return;
      }

      // Update dispatch rules for each phone number
      const updatePromises = phoneNumbers.map(async (phoneNumber: any) => {
        try {
          console.log('🔄 Updating dispatch rules for:', phoneNumber.phone_number);
          
          const response = await fetch('/api/update-dispatch-rule', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              phoneNumberId: phoneNumber.id,
              projectId: projectToUse.id,
              userId: user?.id,
            }),
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to update dispatch rule');
          }
          
          const result = await response.json();
          console.log('✅ Successfully updated dispatch rules for:', phoneNumber.phone_number);
          return { success: true, phoneNumber: phoneNumber.phone_number, result };
        } catch (error) {
          console.error('❌ Failed to update dispatch rules for:', phoneNumber.phone_number, error);
          return { success: false, phoneNumber: phoneNumber.phone_number, error };
        }
      });

      const results = await Promise.all(updatePromises);
      const successful = results.filter((r: any) => r.success);
      const failed = results.filter((r: any) => !r.success);

      console.log('📊 Publishing results:', {
        total: results.length,
        successful: successful.length,
        failed: failed.length
      });

      // Show summary notification
      if (failed.length === 0) {
        // All successful
        const notification = document.createElement('div');
        notification.innerHTML = `
          <div>
            <strong>🎉 Voice agent published successfully!</strong><br>
            Updated ${successful.length} phone number${successful.length > 1 ? 's' : ''}
          </div>
        `;
        notification.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        document.body.appendChild(notification);
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
        }, 5000);
      } else if (successful.length > 0) {
        // Partial success
        const notification = document.createElement('div');
        notification.innerHTML = `
          <div>
            <strong>⚠️ Partially published</strong><br>
            ${successful.length} successful, ${failed.length} failed
          </div>
        `;
        notification.className = 'fixed bottom-4 right-4 bg-yellow-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        document.body.appendChild(notification);
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
        }, 7000);
      } else {
        // All failed
        const notification = document.createElement('div');
        notification.innerHTML = `
          <div>
            <strong>❌ Publishing failed</strong><br>
            Could not update any phone numbers
          </div>
        `;
        notification.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        document.body.appendChild(notification);
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
        }, 7000);
      }

    } catch (error) {
      console.error('❌ Publishing failed:', error);
      
      // Show error notification
      const notification = document.createElement('div');
      notification.textContent = 'Publishing failed. Please try again.';
      notification.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
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
      notification.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
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
      notification.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 max-w-sm';
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
      notification.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
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
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = '24px';
    }
    
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
                    notification.className = 'fixed bottom-4 right-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-sm';
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
        userId: user?.id,
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
      console.log('   • User ID:', user?.id);
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
        notification.className = 'fixed bottom-4 right-4 bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
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
      notification.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 max-w-sm';
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
      notification.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
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
              {isConnecting ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="flex items-center justify-center text-white text-lg"
                >
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Creating Agent Session...
                </motion.div>
              ) : (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="px-8 py-4 bg-black hover:bg-gray-900 text-white font-medium rounded-lg transition-colors text-lg border border-white/20"
                  onClick={() => startConversation()}
                >
                  Start Conversation
                </motion.button>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="connected"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: [0.09, 1.04, 0.245, 1.055] }}
              className="flex flex-col items-center h-full bg-black"
              style={{ '--lk-bg': '#000000' } as React.CSSProperties}
            >
        <AgentVisualizer />
        <div className="flex-1 w-full bg-black">
          <TranscriptionView />
        </div>
        <div className="w-full bg-black">
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
        <div className="h-[200px] w-[200px] sm:h-[300px] sm:w-[300px] md:h-[512px] md:w-[512px] rounded-lg overflow-hidden bg-black">
          <VideoTrack trackRef={videoTrack} />
        </div>
      );
    }
    return (
      <div className="h-[20px] w-full bg-black">
        <BarVisualizer
          state={agentState}
          barCount={5}
          trackRef={audioTrack}
          className="agent-visualizer"
          options={{ minHeight: 12 }}
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
              className="flex h-8 absolute left-1/2 -translate-x-1/2 justify-center"
              style={{
                '--lk-va-bar-width': '72px',
                '--lk-control-bar-height': 'unset'
              } as React.CSSProperties}
            >
              <VoiceAssistantControlBar controls={{ leave: false }} />
              <DisconnectButton 
                onClick={endConversation}
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
    'claude-3-5-haiku': 'anthropic',
    'grok-2': 'xai'
  };

  const providers = [
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
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
      { value: 'claude-opus-4', label: 'Claude Opus 4' },
      { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
      { value: 'claude-3-5-haiku', label: 'Claude 3.5 Haiku' }
    ],
    xai: [
      { value: 'grok-2', label: 'Grok-2' }
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
      <style jsx global>{`
        .agent-visualizer .lk-audio-visualizer-bar {
          background-color: #000000 !important;
        }
        .agent-visualizer .lk-audio-visualizer-bar.lk-audio-visualizer-bar-active {
          background-color: rgba(255, 255, 255, 0.8) !important;
        }
        .lk-audio-visualizer {
          background-color: #000000 !important;
        }
        .agent-visualizer {
          background-color: #000000 !important;
        }
        .agent-visualizer > div {
          background-color: #000000 !important;
        }
        /* Ensure all nested elements have black background */
        .agent-visualizer * {
          background-color: transparent !important;
        }
        .agent-visualizer .lk-audio-visualizer {
          background-color: #000000 !important;
        }
        /* Hide any text in the voice assistant control bar */
        .lk-voice-assistant-control-bar span,
        .lk-voice-assistant-control-bar p,
        .lk-voice-assistant-control-bar div:not([class*="button"]):not([class*="control"]) {
          display: none !important;
        }
        /* Hide text content in LiveKit control elements */
        [data-lk-theme] .lk-voice-assistant-control-bar .lk-button-group span,
        [data-lk-theme] .lk-voice-assistant-control-bar .lk-button-group p,
        [data-lk-theme] .lk-voice-assistant-control-bar .lk-button-group div:not([class*="button"]):not([class*="icon"]) {
          display: none !important;
        }
        /* More specific targeting for LiveKit text elements */
        [data-lk-theme] .lk-voice-assistant-control-bar *:not(button):not(svg):not(path) {
          font-size: 0 !important;
          text-indent: -9999px !important;
        }
      `}</style>
      <div data-lk-theme="default" className="w-full h-screen bg-black flex relative" style={{ fontFamily: 'Helvetica, "Helvetica Neue", Arial, sans-serif' }}>
        {/* Left side - Chat conversation - Hidden on mobile */}
        <div className="hidden md:flex md:w-1/4 bg-neutral-800 border-r border-white/20 flex-col">
          {/* Header with logo */}
          <div className="p-3 bg-neutral-800">
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
          <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent bg-neutral-800">
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
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-white/90">{message.content}</p>
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-xs opacity-70 text-white/70">
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
                    <span className="text-sm text-white/90">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Message input */}
          <div className="p-6 border-t border-white/20 bg-neutral-800">
            <div className="relative bg-white/5 rounded-3xl p-4 border border-white/20">
              <div className="flex items-center space-x-3">
                <button className="w-8 h-8 bg-white hover:bg-gray-100 rounded-full flex items-center justify-center transition-colors">
                  <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                </button>
                
                
                <div className="flex-1">
                  <textarea
                    ref={textareaRef}
                    value={inputMessage}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDownInInput}
                    placeholder="Ask Bun"
                    className="w-full bg-transparent text-white placeholder-white/50 focus:outline-none resize-none text-base leading-relaxed"
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

        {/* Right side - Code/Config view - Full width on mobile, 3/4 width on desktop */}
        <div className="w-full md:w-3/4 bg-black flex flex-col">
          {/* Header with toggle and actions */}
          <div className="flex items-center justify-between p-4 border-b border-white/20 bg-white/10 backdrop-blur-sm">
            <div className="flex items-center space-x-4">
              {/* Mobile logo and hamburger menu */}
              <div className="md:hidden flex items-center space-x-3">
                <button
                  onClick={onBackToHome}
                  className="hover:opacity-80 transition-opacity cursor-pointer"
                  title="Go to home page"
                >
                  <img 
                    src="/VoiceBun-BunOnly.png" 
                    alt="VoiceBun" 
                    className="w-8 h-8"
                  />
                </button>
                
                <button
                  onClick={() => setShowMobileMenu(!showMobileMenu)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  title="Menu"
                >
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
              
              {/* Desktop tab buttons */}
              <div className="hidden md:flex space-x-1 bg-white/10 rounded-lg p-1">
                <button
                onClick={() => setActiveMenu('instructions')}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeMenu === 'instructions' 
                    ? 'bg-white text-black' 
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
              >
                Instructions
                </button>
                <button
                onClick={() => setActiveMenu('models')}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeMenu === 'models' 
                    ? 'bg-white text-black' 
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
              >
                Models
                </button>
                <button
                onClick={() => setActiveMenu('phone')}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeMenu === 'phone' 
                    ? 'bg-white text-black' 
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
              >
                Phone Numbers
                </button>
              </div>
            </div>
            
            {/* Action buttons - reorganized for mobile */}
            <div className="flex items-center space-x-2">
              <button
                onClick={saveProjectConfiguration}
                disabled={isSavingConfig}
                className="px-3 py-1.5 bg-white hover:bg-gray-100 disabled:bg-gray-300 disabled:cursor-not-allowed text-black text-xs font-medium rounded-lg transition-colors flex items-center space-x-1"
              >
                {isSavingConfig ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-black"></div>
                    <span className="hidden sm:inline">Saving...</span>
                  </>
                ) : (
                  <span>Save</span>
                )}
              </button>

              <button 
                onClick={handlePublish}
                disabled={isPublishing}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-500 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors flex items-center space-x-1"
              >
                {isPublishing ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                    <span className="hidden sm:inline">Publishing...</span>
                  </>
                ) : (
                  <span>Publish</span>
                )}
              </button>

              {!isInConversation ? (
                <button
                  onClick={() => {
                    startConversation().catch((err) => {
                      console.error('🔥 Unhandled error in startConversation:', err);
                    });
                  }}
                  disabled={isConnecting}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-500 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors flex items-center space-x-1"
                >
                  {isConnecting ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                      <span className="hidden sm:inline">Connecting...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      <span className="hidden sm:inline">Test Agent</span>
                      <span className="sm:hidden">Test</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={endConversation}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center space-x-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span className="hidden sm:inline">End Call</span>
                  <span className="sm:hidden">End</span>
                </button>
              )}
            </div>
          </div>

          {/* Mobile Menu Sidebar */}
          {showMobileMenu && (
            <div className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setShowMobileMenu(false)}>
              <div className="absolute top-0 left-0 w-64 h-full bg-neutral-800 border-r border-white/20" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b border-white/20">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">Menu</h3>
                    <button
                      onClick={() => setShowMobileMenu(false)}
                      className="p-1 hover:bg-white/10 rounded transition-colors"
                    >
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div className="p-4 space-y-2">
                  <button
                    onClick={() => {
                      setActiveMenu('instructions');
                      setShowMobileMenu(false);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                      activeMenu === 'instructions' 
                        ? 'bg-white text-black' 
                        : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>Instructions</span>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => {
                      setActiveMenu('models');
                      setShowMobileMenu(false);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                      activeMenu === 'models' 
                        ? 'bg-white text-black' 
                        : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span>Models</span>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => {
                      setActiveMenu('phone');
                      setShowMobileMenu(false);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                      activeMenu === 'phone' 
                        ? 'bg-white text-black' 
                        : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <span>Phone Numbers</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Content area */}
          <div className="flex-1 overflow-hidden">
            {activeMenu === 'instructions' ? (
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
                        onChange={(e) => setProjectConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                        className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 resize-none"
                        placeholder="Enter your system prompt here. For example: 'You are a helpful customer service representative for an e-commerce company. You should be friendly, professional, and knowledgeable about products and policies. Always aim to resolve customer issues efficiently while maintaining a positive tone.'"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : activeMenu === 'models' ? (
              <div className="h-full bg-black p-6 overflow-y-auto">
                <div className="max-w-4xl mx-auto space-y-8">
                  {/* Base Model Configuration */}
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
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
                                setSelectedProvider(newProvider);
                                if (firstModel) {
                                  handleModelChange(firstModel);
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
                                setProjectConfig(prev => ({ ...prev, llmModel: e.target.value }));
                                handleModelChange(e.target.value);
                              }}
                              className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-white/30 appearance-none cursor-pointer transition-all duration-200 hover:bg-white/10 pr-10"
                            >
                              {modelsByProvider[projectConfig.llmProvider]?.map(model => (
                                <option key={model.value} value={model.value} className="bg-gray-700 text-white">
                                  {model.label}
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

                  {/* Transcriber Configuration */}
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
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

                  {/* Voice Configuration */}
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
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
                                  ttsVoice: newProvider === 'openai' && prev.ttsVoice === 'british_male' ? 'neutral' : prev.ttsVoice
                                }));
                              }}
                              className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-white/30 appearance-none cursor-pointer transition-all duration-200 hover:bg-white/10 pr-10"
                            >
                              <option value="cartesia" className="bg-gray-700 text-white">Cartesia</option>
                              <option value="openai" className="bg-gray-700 text-white">OpenAI</option>
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
                              <option value="neutral" className="bg-gray-700 text-white">Neutral</option>
                              <option value="male" className="bg-gray-700 text-white">Male</option>
                              {projectConfig.ttsProvider !== 'openai' && (
                                <option value="british_male" className="bg-gray-700 text-white">British Male</option>
                              )}
                              <option value="deep_male" className="bg-gray-700 text-white">Deep Male</option>
                              <option value="female" className="bg-gray-700 text-white">Female</option>
                              <option value="soft_female" className="bg-gray-700 text-white">Soft Female</option>
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
                </div>
              </div>
            ) : activeMenu === 'phone' ? (
              <div className="h-full bg-black p-6 overflow-y-auto">
                <div className="max-w-4xl mx-auto space-y-8">
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center">
                        <svg className="w-6 h-6 mr-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        <h3 className="text-xl font-semibold text-white">Phone Numbers</h3>
                      </div>
                      <button
                        onClick={() => setShowTelnyxNumbersModal(true)}
                        className="px-4 py-2 bg-white hover:bg-gray-100 text-black font-medium rounded-lg transition-colors flex items-center space-x-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Purchase Number</span>
                      </button>
                    </div>
                    
                    <div className="space-y-6">
                      <p className="text-white/70">
                        Configure phone numbers for your voice agent to handle inbound calls.
                      </p>
                      
                      {/* Phone Number Manager */}
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
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center bg-black">
                <div className="text-center space-y-6 p-8 max-w-md mx-auto">
                  <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto">
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                  <div className="flex flex-col items-center">
                    <h3 className="text-2xl font-semibold text-white mb-3">Configure Your Agent</h3>
                    <p className="text-white/70 mb-6">Use the tabs above to configure your voice agent's instructions, models, and phone numbers. Then use the "Test Agent" button in the top right to start a conversation.</p>
                  </div>
                  
                  <div className="border-t border-white/20 pt-6">
                    <h4 className="text-md font-medium text-white mb-3">Quick Start</h4>
                    <ul className="text-white/70 text-sm space-y-2 text-left">
                      <li>• Set up your system prompt in the Instructions tab</li>
                      <li>• Configure your AI models in the Models tab</li>
                      <li>• Add a phone number in the Phone Numbers tab</li>
                      <li>• Click "Test Agent" to start testing</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Voice Assistant Overlay - Only show when connected */}
        {isInConversation && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 flex items-center justify-center p-2 sm:p-4">
            <div className="pointer-events-auto w-full max-w-sm sm:max-w-2xl max-h-[85vh] sm:max-h-[90vh] overflow-hidden">
              <div className="bg-black/90 backdrop-blur-sm rounded-xl sm:rounded-2xl border border-white/20 relative h-full flex flex-col">
                {/* Mobile-friendly Header */}
                <div className="flex items-center justify-between p-3 sm:p-4 border-b border-white/20 flex-shrink-0">
                  <h3 className="text-base sm:text-lg font-semibold text-white flex items-center">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    <span className="hidden sm:inline">Voice Agent Test</span>
                    <span className="sm:hidden">Voice Test</span>
                  </h3>
                  <button
                    onClick={endConversation}
                    className="w-7 h-7 sm:w-8 sm:h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors group"
                    title="End conversation"
                  >
                    <svg className="w-3 h-3 sm:w-4 sm:h-4 text-white/70 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-6">
                  <div className="space-y-3 sm:space-y-6">
                    {/* Agent Visualizer - Reduced size for mobile */}
                    <div className="flex justify-center">
                      <div className="w-full max-w-xs sm:max-w-md">
                        <AgentVisualizer />
                      </div>
                    </div>
                    
                    {/* Live Transcription */}
                    <div className="w-full">
                      <div className="bg-black rounded-lg p-2 sm:p-4 border border-white/20">
                        <h4 className="text-white font-medium mb-2 sm:mb-3 flex items-center justify-center text-xs sm:text-base">
                          <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                          </svg>
                          Live Transcription
                        </h4>
                        <div className="max-h-24 sm:max-h-40 overflow-y-auto text-sm sm:text-base">
                          <TranscriptionView />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Controls Footer */}
                <div className="border-t border-white/20 p-2 sm:p-4 flex-shrink-0">
                  <div className="space-y-2 sm:space-y-3">
                    <ConversationControlBar />
                    <RoomAudioRenderer />
                    <VoiceAssistantNotification />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
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

// Voice Assistant Notification Component (moved inside RoomContext)
function VoiceAssistantNotification() {
  const { state: agentState } = useVoiceAssistant();
  return <NoAgentNotification state={agentState} />;
}