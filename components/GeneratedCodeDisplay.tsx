import { useState, useEffect, useRef, useCallback } from 'react';
import { type VoiceAgentConfig } from './VoiceAgentConfig';
import TranscriptionView from "./TranscriptionView";
import { AnimatePresence, motion } from "framer-motion";
import { useDatabase } from '@/hooks/useDatabase';
import { useAuth } from '@/contexts/AuthContext';
import { ChatSession, Project } from '@/lib/database/types';
import { TelnyxNumbersModal } from './TelnyxNumbersModal';
import { PhoneNumbersTab } from './PhoneNumbersTab';
import { Edit2, Check, X } from 'lucide-react';
import { ClientDatabaseService } from '@/lib/database/client-service';
import { LoadingSpinner } from './LoadingBun';
import { FunctionsTab } from './FunctionsTab';
import { TestTypeModal } from './TestTypeModal';
import { ModelsTab } from './ModelsTab';
import { CloneVoiceModal } from './CloneVoiceModal';
import { ChatPanel } from './ChatPanel';
import { InstructionsTab } from './InstructionsTab';
import { MobileNavigation } from './MobileNavigation';
import { VoiceConversationModal } from './VoiceConversationModal';
import { Room, RoomEvent, VideoPresets } from "livekit-client";
import {
  BarVisualizer,
  DisconnectButton,
  RoomAudioRenderer,
  RoomContext,
  VideoTrack,
  VoiceAssistantControlBar,
  useVoiceAssistant,
} from "@livekit/components-react";
import { CloseIcon } from "./CloseIcon";
import { getCategoryEmoji, type ProjectCategory } from '@/lib/auto-tagger';

interface GeneratedCodeDisplayProps {
  code: string;
  config: VoiceAgentConfig;
  project: Project;
  onBackToHome: () => void;
  onStartConversation?: () => void;
  onProjectUpdate?: (updatedProject: Project) => void;
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

export function GeneratedCodeDisplay({ code, config, project, onBackToHome, onStartConversation, onProjectUpdate }: Omit<GeneratedCodeDisplayProps, 'onReconfigure'>) {
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
  const [showTelnyxNumbersModal, setShowTelnyxNumbersModal] = useState(false);
  const [phoneNumberRefreshKey, setPhoneNumberRefreshKey] = useState(0);
  const [availableNumbers, setAvailableNumbers] = useState<Array<{
    id: string; 
    phone_number: string;
    features?: PhoneNumberFeature[];
    region_information?: Array<{ region_name?: string }>;
    cost_information?: {
      monthly_cost?: string;
      upfront_cost?: string;
    };
  }>>([]);
  const [selectedNumber, setSelectedNumber] = useState<{
    id: string; 
    phone_number: string;
    features?: PhoneNumberFeature[];
    region_information?: Array<{ region_name?: string }>;
    cost_information?: {
      monthly_cost?: string;
      upfront_cost?: string;
    };
  } | null>(null);
  const [assignedPhoneNumber, setAssignedPhoneNumber] = useState<string | null>(null);
  const [assignedPhoneNumberId, setAssignedPhoneNumberId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'test' | 'agent' | 'config'>('test');
  
  // Add debug logging for state changes
  useEffect(() => {
    console.log('🔄 STATE CHANGE - activeTab:', activeTab);
  }, [activeTab]);
  const [activeMenu, setActiveMenu] = useState<'instructions' | 'models' | 'phone' | 'functions' | 'other'>('instructions');

  const [currentConfigurationId, setCurrentConfigurationId] = useState<string | null>(null);

  const [selectedModel, setSelectedModel] = useState('gpt-4-turbo');

  // Voice conversation modal state
  const [showVoiceConversationModal, setShowVoiceConversationModal] = useState(false);
  const [isInConversation, setIsInConversation] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

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
    ttsProvider: 'cartesia' as 'cartesia' | 'openai' | 'clone_voice',
    ttsVoice: 'neutral' as string,

    phoneNumber: null as string | null,
    phoneInboundEnabled: true,
    phoneOutboundEnabled: false,
    phoneRecordingEnabled: true,
    responseLatencyPriority: 'balanced' as 'speed' | 'balanced' | 'quality',
    knowledgeBaseFiles: [] as Array<{name: string; type: "pdf" | "txt" | "docx" | "csv" | "json"; content: string; size: number}>,
    functionsEnabled: false,
    customFunctions: [] as Array<{name: string; description: string; parameters: Record<string, any>}>,
    webhooksEnabled: false,
    webhookUrl: null as string | null,
    webhookEvents: [] as string[],
    
    // Community Publishing Fields
    projectEmoji: '🤖',
    projectPhoto: null as string | null,
    publicTitle: '',
    publicDescription: '',
    publicWelcomeMessage: '',
    showBranding: true,
    customBrandingText: null as string | null,
    customBrandingUrl: null as string | null
  });
  const [isSavingConfig, setIsSavingConfig] = useState(false);
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
    getProjectPhoneNumbers,
    getUserPlan,
    getUserCustomVoices
  } = useDatabase();
  
  // Project title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(project?.name || 'Untitled Project');
  const [isUpdatingTitle, setIsUpdatingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  
  // Audio recording state for Clone Voice
  // const [isRecording, setIsRecording] = useState(false);
  // const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  // const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  // const [recordingDuration, setRecordingDuration] = useState(0);
  // const [recordingTimer, setRecordingTimer] = useState<NodeJS.Timeout | null>(null);
  // const [isPlaying, setIsPlaying] = useState(false);
  // const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  
  // Voice cloning state
  // const [voiceName, setVoiceName] = useState('');
  // const [isCloning, setIsCloning] = useState(false);
  const [customVoices, setCustomVoices] = useState<Array<{ id: string; displayName: string; createdAt: string; }>>([]);
  const [showCloneVoiceModal, setShowCloneVoiceModal] = useState(false);
  
  // Ref for debouncing file saves
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Refs to store initial values and prevent re-creation
  const initialConfigRef = useRef(config);
  const initialCodeRef = useRef(code);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // State for test type selection modal
  const [showTestTypeModal, setShowTestTypeModal] = useState(false);

  // Function dropdown state
  const [showFunctionDropdown, setShowFunctionDropdown] = useState(false);
  const [editingFunction, setEditingFunction] = useState<number | null>(null);
  const [functionConfig, setFunctionConfig] = useState<{
    name: string;
    description: string;
    parameters: any;
    headers?: Record<string, string>;
    body?: any;
    url?: string;
  } | null>(null);
  const functionDropdownRef = useRef<HTMLDivElement>(null);

  // Additional state
  const [room] = useState(() =>
    new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: VideoPresets.h540.resolution,
      },
    }),
  );

  // Database service instance for project updates
  const dbService = useRef(new ClientDatabaseService()).current;

  // Update edited title when project prop changes
  useEffect(() => {
    if (project?.name && !isEditingTitle) {
      setTempTitle(project.name);
    }
  }, [project?.name, isEditingTitle]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Handle project title update
  const updateProjectTitle = async () => {
    if (!project || !tempTitle.trim() || tempTitle === project.name) {
      setIsEditingTitle(false);
      setTempTitle(project?.name || '');
      return;
    }

    setIsUpdatingTitle(true);
    try {
      await dbService.updateProject(project.id, { 
        name: tempTitle.trim(),
        updated_at: new Date().toISOString()
      });
      
      // Create updated project object
      const updatedProject: Project = {
        ...project,
        name: tempTitle.trim(),
        updated_at: new Date().toISOString()
      };
      
      // Notify parent component of the update
      if (onProjectUpdate) {
        onProjectUpdate(updatedProject);
      }
      
      console.log('✅ Project title updated successfully');
      setIsEditingTitle(false);
    } catch (error) {
      console.error('❌ Failed to update project title:', error);
      // Reset to original title on error
      setTempTitle(project.name);
      alert('Failed to update project title. Please try again.');
    } finally {
      setIsUpdatingTitle(false);
    }
  };

  // Handle title edit start
  const startEditingTitle = () => {
    if (project) {
      setIsEditingTitle(true);
      setTempTitle(project.name);
    }
  };

  // Handle title edit cancel
  const cancelEditingTitle = () => {
    setIsEditingTitle(false);
    setTempTitle(project?.name || '');
  };

  // Handle Enter key press in title input
  const handleTitleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      updateProjectTitle();
    } else if (e.key === 'Escape') {
      cancelEditingTitle();
    }
  };

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

  // Handle clicking outside function dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (functionDropdownRef.current && !functionDropdownRef.current.contains(event.target as Node)) {
        setShowFunctionDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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
      // Load custom voices from the user plan instead of project
      try {
        const customVoicesFromPlan = await getUserCustomVoices();
        setCustomVoices(customVoicesFromPlan);
        console.log('🎵 Loaded custom voices from user plan:', customVoicesFromPlan.length);
      } catch (error) {
        console.error('❌ Failed to load custom voices from user plan:', error);
        setCustomVoices([]);
      }

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
          ttsVoice: projectData.tts_voice || 'neutral',
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
          webhookEvents: projectData.webhook_events,
          
          // Community Publishing Fields
          projectEmoji: projectData.project_emoji ||'🤖',
          projectPhoto: projectData.project_photo || null,
          publicTitle: projectData.public_title || '',
          publicDescription: projectData.public_description || '',
          publicWelcomeMessage: projectData.agent_instructions || '', // Load welcome message from agent_instructions
          showBranding: projectData.show_branding !== undefined ? projectData.show_branding : true,
          customBrandingText: projectData.custom_branding_text || null,
          customBrandingUrl: projectData.custom_branding_url || null
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
      setCustomVoices([]);
    }
  }, [project, currentProject, getProjectData, getUserCustomVoices]);

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
      if (existingData) {
        console.log('📋 Current active record details:', {
          id: existingData.id,
          version: existingData.version,
          is_active: existingData.is_active,
          created_at: existingData.created_at
        });
      }
      
      // Auto-tag the project based on its content
      console.log('🏷️ Starting auto-tagging process...');
      let autoTaggedCategory = 'other'; // Default category
      
      try {
        const autoTagResponse = await fetch('/api/auto-tag', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            systemPrompt: projectConfig.systemPrompt,
            title: projectConfig.publicTitle || projectToUse.name,
            description: projectToUse.description || undefined,
            publicDescription: projectConfig.publicDescription || undefined
          }),
        });

        if (autoTagResponse.ok) {
          const { category } = await autoTagResponse.json();
          autoTaggedCategory = category || 'other';
          console.log('✅ Project auto-tagged as:', autoTaggedCategory);
        } else {
          console.warn('⚠️ Auto-tagging failed, using default category');
        }
      } catch (error) {
        console.error('❌ Auto-tagging error:', error);
        // Continue with default category
      }

      // Get the emoji for the auto-tagged category
      const categoryEmoji = getCategoryEmoji(autoTaggedCategory as ProjectCategory);
      console.log('🎯 Setting project emoji based on category:', `${autoTaggedCategory} -> ${categoryEmoji}`);
      
      // Update the project config state to reflect the new emoji
      setProjectConfig(prev => ({
        ...prev,
        projectEmoji: categoryEmoji
      }));
      
      const configData = {
        system_prompt: projectConfig.systemPrompt,
        agent_instructions: projectConfig.publicWelcomeMessage, // Save welcome message as agent instructions
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
        webhook_events: projectConfig.webhookEvents,
        
        // Community Publishing Fields
        project_emoji: categoryEmoji, // Use the emoji based on the auto-tagged category
        project_photo: projectConfig.projectPhoto,
        public_title: projectConfig.publicTitle,
        public_description: projectConfig.publicDescription,
        public_welcome_message: projectConfig.publicWelcomeMessage,
        show_branding: projectConfig.showBranding,
        custom_branding_text: projectConfig.customBrandingText,
        custom_branding_url: projectConfig.customBrandingUrl,
        
        // Auto-tagging field
        category: autoTaggedCategory
      };

      console.log('💾 Attempting to save config data:', {
        projectId: projectToUse.id,
        configData: Object.keys(configData),
        operation: existingData ? 'UPDATE' : 'CREATE'
      });

      if (existingData) {
        // Update existing configuration
        console.log('🔄 Updating existing configuration...');
        const result = await updateProjectData(projectToUse.id, configData);
        console.log('✅ Updated project configuration in database');
        console.log('📋 New active record details:', {
          id: result.id,
          version: result.version,
          is_active: result.is_active,
          created_at: result.created_at,
          updated_at: result.updated_at
        });
        
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
        const result = await createProjectData(projectToUse.id, configData);
        console.log('✅ Created new project configuration in database');
        console.log('📋 New active record details:', {
          id: result.id,
          version: result.version,
          is_active: result.is_active,
          created_at: result.created_at
        });
        
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
  }, [code, config, createFilesSnapshot]);

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

  // Handle test agent button click - show modal to choose test type
  const handleTestAgentClick = async () => {
    // setTestType(null); // Reset to show choice popup - not needed anymore
    setShowTestTypeModal(true);
    
    // Load available phone numbers for the modal
    try {
      let projectToUse = project || currentProject;
      
      if (!projectToUse && createProject) {
        projectToUse = await createProject(
          `Voice Agent - ${config.prompt.substring(0, 50)}${config.prompt.length > 50 ? '...' : ''}`,
          `Generated voice agent based on: ${config.prompt}`,
          config.prompt,
          config,
          code
        );
      }

      if (projectToUse) {
        const phoneNumbers = await getProjectPhoneNumbers(projectToUse.id);
        setAvailableNumbers(phoneNumbers || []);
      }
    } catch (error) {
      console.error('❌ Failed to load phone numbers:', error);
      setAvailableNumbers([]);
    }
  };

  // Handle outbound test call
  const handleOutboundTestAPI = async (phoneNumberId: string, toNumber: string) => {
      // Ensure project exists
      let projectToUse = project || currentProject;
      
      if (!projectToUse && createProject) {
        projectToUse = await createProject(
          `Voice Agent - ${config.prompt.substring(0, 50)}${config.prompt.length > 50 ? '...' : ''}`,
          `Generated voice agent based on: ${config.prompt}`,
          config.prompt,
          config,
          code
        );
      }

      if (!projectToUse) {
        throw new Error('No project available for outbound test');
      }
      
      // Make outbound call using the selected phone number
      const response = await fetch('/api/make-outbound-call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
        phoneNumberId: phoneNumberId,
          projectId: projectToUse.id,
          userId: user?.id,
        toNumber: toNumber
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to initiate outbound call');
      }

      const result = await response.json();
      console.log('✅ Outbound call initiated:', result);
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
            userId: user?.id,
            metadata: {
              projectId: projectToUse.id,
              userId: user?.id,
              timestamp: new Date().toISOString()
            }
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

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
  };

  // Effect to auto-select first custom voice when switching to clone_voice provider
  useEffect(() => {
    if (projectConfig.ttsProvider === 'clone_voice' && customVoices.length > 0) {
      // If no voice is selected or current selection is not valid, select the first custom voice
      const currentVoiceExists = customVoices.some(voice => voice.id === projectConfig.ttsVoice);
      if (!projectConfig.ttsVoice || !currentVoiceExists) {
        setProjectConfig(prev => ({ ...prev, ttsVoice: customVoices[0].id }));
      }
    }
  }, [projectConfig.ttsProvider, customVoices, projectConfig.ttsVoice, setProjectConfig]);

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
        {/* Auto-hiding Left Panel */}
        <ChatPanel
          isExpanded={true}
          onExpandedChange={() => {}} // No-op since panel is always static
          messages={messages}
          inputMessage={inputMessage}
          onInputChange={setInputMessage}
          onSendMessage={sendMessage}
          isGenerating={isGenerating}
          onBackToHome={onBackToHome}
        />

        {/* Main Content Area - now takes full width */}
        <div className="flex-1 bg-black flex flex-col transition-all duration-300 ml-80">
          {/* Header with toggle and actions */}
          <div className="flex items-center justify-between p-4 border-b border-white/20 bg-white/10 backdrop-blur-sm">
            {/* Left side - VoiceBun Logo and Project Title */}
            <div className="flex items-center space-x-4 flex-1">
              <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-3">
                  {/* Project Title */}
                  <div className="flex items-center space-x-2">
                    {isEditingTitle ? (
                      <div className="flex items-center space-x-2">
                        <input
                          ref={titleInputRef}
                          type="text"
                          value={tempTitle}
                          onChange={(e) => setTempTitle(e.target.value)}
                          onKeyDown={handleTitleKeyPress}
                          onBlur={updateProjectTitle}
                          className="bg-white/10 text-white border border-white/30 rounded-md px-2 py-1 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent"
                          placeholder="Project name"
                          disabled={isUpdatingTitle}
                        />
                        <button
                          onClick={updateProjectTitle}
                          disabled={isUpdatingTitle}
                          className="p-1 hover:bg-white/10 rounded transition-colors text-green-400 hover:text-green-300"
                          title="Save title"
                        >
                          {isUpdatingTitle ? (
                            <LoadingSpinner size="md" color="green" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={cancelEditingTitle}
                          disabled={isUpdatingTitle}
                          className="p-1 hover:bg-white/10 rounded transition-colors text-red-400 hover:text-red-300"
                          title="Cancel editing"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <h1 className="text-white font-medium text-sm" title={project.name}>
                          {project.name}
                        </h1>
                        <button
                          onClick={startEditingTitle}
                          className="p-1 hover:bg-white/10 rounded transition-colors text-white/60 hover:text-white"
                          title="Edit project title"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
              </div>
            </div>
          </div>

            {/* Center - Tab Navigation */}
            <div className="hidden md:flex justify-center flex-1">
              <div className="flex space-x-1 bg-white/10 rounded-lg p-1">
                <button
                onClick={() => setActiveMenu('instructions')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeMenu === 'instructions' 
                    ? 'bg-white text-black' 
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                Instructions
                </button>
                <button
                onClick={() => setActiveMenu('models')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeMenu === 'models' 
                    ? 'bg-white text-black' 
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                Models
                </button>
                <button
                onClick={() => setActiveMenu('phone')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeMenu === 'phone' 
                    ? 'bg-white text-black' 
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                  Phone
                </button>
                <button
                onClick={() => setActiveMenu('functions')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeMenu === 'functions' 
                    ? 'bg-white text-black' 
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                Functions
                </button>
              </div>
            </div>
            
            {/* Mobile Menu Button */}
            {/* Mobile menu is now handled by the MobileNavigation component */}
            
            {/* Right side - Action buttons */}
            <div className="flex items-center space-x-2 flex-1 justify-end">
              <button
                onClick={saveProjectConfiguration}
                disabled={isSavingConfig}
                className="px-3 py-1.5 bg-white hover:bg-gray-100 disabled:bg-gray-300 disabled:cursor-not-allowed text-black text-xs font-medium rounded-lg transition-colors flex items-center space-x-1"
              >
                {isSavingConfig ? (
                  <>
                    <LoadingSpinner size="sm" color="black" />
                    <span className="hidden sm:inline">Saving...</span>
                  </>
                ) : (
                  <span>Save</span>
                )}
              </button>

              {!isInConversation ? (
                <button
                  onClick={handleTestAgentClick}
                  disabled={isConnecting}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-500 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors flex items-center space-x-1"
                >
                  {isConnecting ? (
                    <>
                      <LoadingSpinner size="sm" color="white" />
                      <span className="hidden sm:inline">Connecting...</span>
                    </>
                  ) : (
                    <>
                      <span className="hidden sm:inline">Test</span>
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

          <MobileNavigation
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
          />

          {/* Content area */}
          <div className="flex-1 overflow-auto">
            {activeMenu === 'instructions' ? (
              <InstructionsTab
                projectConfig={projectConfig}
                setProjectConfig={setProjectConfig}
              />
            ) : activeMenu === 'models' ? (
              <ModelsTab
                projectConfig={projectConfig}
                setProjectConfig={setProjectConfig}
                customVoices={customVoices}
                onShowCloneVoiceModal={() => setShowCloneVoiceModal(true)}
                onModelChange={handleModelChange}
              />
            ) : activeMenu === 'phone' ? (
              <PhoneNumbersTab
                project={project}
                currentProject={currentProject}
                user={user}
                getProjectPhoneNumbers={getProjectPhoneNumbers}
                onTestAgentClick={() => setShowTestTypeModal(true)}
                onOutboundTestAPI={async (phoneNumberId: string, toNumber: string) => {
                  // This will be handled internally by PhoneNumbersTab
                }}
                setAssignedPhoneNumber={setAssignedPhoneNumber}
                setAssignedPhoneNumberId={setAssignedPhoneNumberId}
                setAvailableNumbers={setAvailableNumbers}
                createProject={createProject}
                config={config}
                code={code}
                        onPurchaseNumber={() => setShowTelnyxNumbersModal(true)}
                      />
            ) : activeMenu === 'functions' ? (
              <FunctionsTab 
                projectConfig={projectConfig}
                setProjectConfig={setProjectConfig}
                projectId={project?.id || currentProject?.id || ''}
              />
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
        <VoiceConversationModal
          isOpen={showVoiceConversationModal}
          onClose={() => {
            setShowVoiceConversationModal(false);
            endConversation();
          }}
          config={config}
          project={project}
          currentProject={currentProject}
          projectConfig={projectConfig}
          user={user}
          createProject={createProject}
          code={code}
        />
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
      
      {/* Test Type Selection Modal */}
      <TestTypeModal
        isOpen={showTestTypeModal}
        onClose={() => setShowTestTypeModal(false)}
        availablePhoneNumbers={availableNumbers}
        user={user}
        onWebTest={() => {
          console.log('🌐 Web test selected - showing voice conversation modal');
          setShowVoiceConversationModal(true);
        }}
        onOutboundTest={handleOutboundTestAPI}
      />

      {/* Clone Voice Modal */}
      <CloneVoiceModal
        isOpen={showCloneVoiceModal}
        onClose={() => setShowCloneVoiceModal(false)}
        onVoiceCloned={() => {
          // Refresh custom voices list if needed
          // This could trigger a re-fetch of custom voices
        }}
        projectId={project?.id || currentProject?.id}
      />
    </RoomContext.Provider>
  );
}