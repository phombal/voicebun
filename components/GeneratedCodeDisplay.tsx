import { useState, useEffect, useRef, useCallback } from 'react';
import { type VoiceAgentConfig } from './VoiceAgentConfig';
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
import { VoiceConversationModal } from './VoiceConversationModal';
import { getCategoryEmoji, type ProjectCategory } from '@/lib/auto-tagger';
import { Room, RoomEvent, VideoPresets } from "livekit-client";
import {
  RoomContext,
} from "@livekit/components-react";
import Image from 'next/image';

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

export function GeneratedCodeDisplay({ code, config, project, onProjectUpdate }: Omit<GeneratedCodeDisplayProps, 'onReconfigure'>) {
  // Debug logging on every render
  console.log('🔍 GeneratedCodeDisplay RENDER:');
  console.log('   • Component props:', { hasCode: !!code, hasConfig: !!config, hasProject: !!project });
  console.log('   • Config prompt:', config?.prompt?.substring(0, 50) + '...' || 'NO PROMPT');
  console.log('🎨 GeneratedCodeDisplay rendered with project:', project?.id || 'null');
  // State variables
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [showTelnyxNumbersModal, setShowTelnyxNumbersModal] = useState(false);
  const [availablePhoneNumbers, setAvailablePhoneNumbers] = useState<Array<{
    id: string;
    phone_number: string;
    country_code?: string;
    locality?: string;
    phone_number_type?: string;
    features?: PhoneNumberFeature[];
    region_information?: Array<{ region_name?: string }>;
    cost_information?: {
      monthly_cost?: string;
      upfront_cost?: string;
    };
  }>>([]);
  const [activeTab] = useState('test' as const);
  
  // Add debug logging for state changes
  useEffect(() => {
    console.log('🔄 STATE CHANGE - activeTab:', activeTab);
  }, [activeTab]);
  const [activeMenu, setActiveMenu] = useState<'instructions' | 'models' | 'phone' | 'functions' | 'other'>('instructions');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Remove unused configuration ID state variable

  // Remove unused selected model state variable

  // Voice conversation modal state
  const [showVoiceConversationModal, setShowVoiceConversationModal] = useState(false);
  const [isInConversation, setIsInConversation] = useState(false);
  const [isConnecting] = useState(false);

  // Project configuration state
  const [projectConfig, setProjectConfig] = useState({
    systemPrompt: '', // Will be loaded from database by loadProjectConfiguration
    agentInstructions: '',
    firstMessageMode: 'wait' as 'wait' | 'speak_first' | 'speak_first_with_model_generated_message',
    llmProvider: 'openai' as 'openai' | 'anthropic' | 'google' | 'azure' | 'xai',
    llmModel: 'gpt-4o-mini',
    llmTemperature: 0.7,
    // eslint-disable-next-line @typescript-eslint/prefer-as-const
    llmMaxResponseLength: 300 as 150 | 300 | 500 | 1000,
    // eslint-disable-next-line @typescript-eslint/prefer-as-const
    sttProvider: 'deepgram' as 'deepgram',
    // eslint-disable-next-line @typescript-eslint/prefer-as-const
    sttLanguage: 'en' as 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ja' | 'ko' | 'zh',
    // eslint-disable-next-line @typescript-eslint/prefer-as-const
    sttQuality: 'enhanced' as 'standard' | 'enhanced' | 'premium',
    // eslint-disable-next-line @typescript-eslint/prefer-as-const
    sttProcessingMode: 'streaming' as 'streaming' | 'batch',
    sttNoiseSuppression: true,
    sttAutoPunctuation: true,
    // eslint-disable-next-line @typescript-eslint/prefer-as-const
    ttsProvider: 'cartesia' as 'cartesia' | 'openai' | 'clone_voice',
    ttsVoice: 'neutral' as string,

    phoneNumber: null as string | null,
    phoneInboundEnabled: true,
    phoneOutboundEnabled: false,
    phoneRecordingEnabled: true,
    // eslint-disable-next-line @typescript-eslint/prefer-as-const
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

  // Database integration state
  const [codeEditSession, setCodeEditSession] = useState<ChatSession | null>(null);
  const { user } = useAuth();
  const { 
    currentProject, 
    startChatSession,
    createProject,
    createProjectData,
    getProjectData,
    updateProjectData,
    getProjectPhoneNumbers,
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

  // Remove unused variable
  // const textareaRef = useRef<HTMLTextAreaElement>(null);

  // State for test type selection modal
  const [showTestTypeModal, setShowTestTypeModal] = useState(false);

  // Function dropdown state
  // const [editingFunction, setEditingFunction] = useState<number | null>(null);
  // const [functionConfig, setFunctionConfig] = useState<{
  //   name: string;
  //   description: string;
  //   parameters: any;
  //   headers?: Record<string, string>;
  //   body?: any;
  //   url?: string;
  // } | null>(null);
  // const functionDropdownRef = useRef<HTMLDivElement>(null);

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
      let customVoicesFromPlan: any[] = [];
      try {
        customVoicesFromPlan = await getUserCustomVoices();
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
        
        // Ensure clone_voice provider is properly preserved
        let ttsProvider = projectData.tts_provider;
        if ((projectData.tts_provider as string) === 'elevenlabs') {
          ttsProvider = 'cartesia'; // Legacy conversion
        }
        
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
          ttsProvider: ttsProvider,
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
        console.log('🎵 TTS Provider from database:', projectData.tts_provider);
        console.log('🎵 TTS Provider after processing:', newConfig.ttsProvider);
        console.log('🎵 TTS Voice from database:', projectData.tts_voice);
        
        // Special handling for clone_voice provider
        if (newConfig.ttsProvider === 'clone_voice') {
          console.log('🎵 CLONE_VOICE provider detected - ensuring proper configuration');
          console.log('🎵 Custom voices available:', customVoicesFromPlan.length);
          
          // If we have custom voices and no specific voice is set, use the first one
          if (customVoicesFromPlan.length > 0 && (!newConfig.ttsVoice || newConfig.ttsVoice === 'neutral')) {
            newConfig.ttsVoice = customVoicesFromPlan[0].id;
            console.log('🎵 Auto-selected first custom voice:', customVoicesFromPlan[0].displayName);
          }
        }
        
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
        notification.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 max-w-sm';
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
    };
    
    setMessages([welcomeMessage]);
  }, [code, config]);

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
    
    // Note: textareaRef was removed as it was causing the warning
    // If you need to reset textarea height, you'll need to handle it differently
    
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
                    
                    // Filter out empty or invalid updates
                    const validUpdates = parsed.configurationUpdates.filter((update: any) => 
                      update.field && update.value !== undefined && update.field.trim() !== ''
                    );
                    
                    if (validUpdates.length > 0) {
                      // Apply configuration updates
                      setProjectConfig(prev => {
                        const newConfig = { ...prev };
                        
                        validUpdates.forEach((update: any) => {
                          console.log(`Updating ${update.field} to:`, update.value);
                          (newConfig as any)[update.field] = update.value;
                        });
                        
                        return newConfig;
                      });

                      // Show notification about configuration updates
                      const notification = document.createElement('div');
                      
                      // Create a more detailed notification
                      const updatedFields = validUpdates.map((update: any) => update.field).join(', ');
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
                    } else {
                      console.log('No valid configuration updates to apply');
                    }
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
        setAvailablePhoneNumbers(phoneNumbers || []);
      }
    } catch (error) {
      console.error('❌ Failed to load phone numbers:', error);
      setAvailablePhoneNumbers([]);
    }
  };

  // Handle outbound test call
  const handleOutboundTestAPI = async (/* phoneNumberId: string, toNumber: string */) => {
      // Handle outbound test API calls internally in PhoneNumbersTab
  };

  // const startConversation = async () => {
  //   console.log('🔥 CLICKED START CONVERSATION BUTTON!');
  //   // ... rest of function commented out ...
  // };

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

  // function AgentVisualizer() {
  //   // ... function commented out ...
  // }

  // function ConversationControlBar() {
  //   // ... function commented out ...
  // }

  // Clear any existing timeouts on component mount to prevent cached timeout callbacks
  useEffect(() => {
    // Clear all existing timeouts that might have been set before the UUID fix
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
  }, []); // Empty dependency array means this runs once on mount

  // Effect to auto-select first custom voice when switching to clone_voice provider
  useEffect(() => {
    if (projectConfig.ttsProvider === 'clone_voice' && customVoices.length > 0) {
      // If no voice is selected or current selection is not valid, select the first custom voice
      const currentVoiceExists = customVoices.some(voice => voice.id === projectConfig.ttsVoice);
      if (!projectConfig.ttsVoice || !currentVoiceExists) {
        console.log('🎵 Auto-selecting first custom voice:', customVoices[0].displayName);
        setProjectConfig(prev => ({ ...prev, ttsVoice: customVoices[0].id }));
      }
    }
  }, [projectConfig.ttsProvider, customVoices, projectConfig.ttsVoice, setProjectConfig]);

  // Effect to ensure clone_voice provider is preserved after page reload
  useEffect(() => {
    // This effect runs after configuration is loaded from database
    if (projectConfig.ttsProvider === 'clone_voice') {
      console.log('✅ Clone voice provider preserved after page load');
      console.log('🎵 Current TTS voice:', projectConfig.ttsVoice);
      console.log('🎵 Available custom voices:', customVoices.length);
    }
  }, [projectConfig.ttsProvider, projectConfig.ttsVoice, customVoices]);

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
        
        /* Custom scrollbar styling for consistent appearance */
        .scrollbar-thin {
          scrollbar-width: thin;
          scrollbar-color: rgba(107, 114, 128, 0.8) transparent;
        }
        
        .scrollbar-thin::-webkit-scrollbar {
          width: 6px;
        }
        
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background-color: rgba(107, 114, 128, 0.8);
          border-radius: 3px;
        }
        
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background-color: rgba(107, 114, 128, 1);
        }
        
        /* Ensure smooth scrolling behavior */
        .smooth-scroll {
          scroll-behavior: smooth;
          overscroll-behavior: contain;
        }
      `}</style>
      <div data-lk-theme="default" className="w-full h-screen bg-black flex flex-col relative" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        {/* Full-width Header Navigation Bar */}
        <div className="sticky top-0 left-0 right-0 z-50 flex items-center justify-between p-4 bg-black/80 backdrop-blur-md">
          {/* Left side - Mobile Menu Button, VoiceBun Logo and Project Title */}
          <div className="flex items-center space-x-4 flex-1">
            {/* Mobile Menu Button - Only visible on mobile */}
            <div className="md:hidden">
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="w-8 h-8 hover:bg-white/10 rounded-lg transition-colors flex items-center justify-center"
                title="Menu"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>

            {/* VoiceBun Logo */}
            <div className="hidden md:flex items-center">
              <Image 
                src="/VoiceBun-BunOnly.png" 
                alt="VoiceBun" 
                width={32}
                height={32}
                className="h-8 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => window.location.href = '/dashboard'}
              />
            </div>
                
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
                className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-400 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors flex items-center space-x-1"
                >
                  {isConnecting ? (
                    <>
                      <LoadingSpinner size="sm" color="white" />
                      <span className="hidden sm:inline">Connecting...</span>
                    </>
                  ) : (
                    <>
                    <span className="hidden sm:inline">Talk to Agent</span>
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
                
                <button
                  onClick={() => {
                    setActiveMenu('functions');
                    setShowMobileMenu(false);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                    activeMenu === 'functions' 
                      ? 'bg-white text-black' 
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    <span>Functions</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content area below navigation bar */}
        <div className="flex flex-1 h-0">
          {/* Chat Panel - Hidden on mobile, visible on desktop (left side) */}
          <div className="hidden lg:flex lg:w-1/4 bg-black h-full overflow-hidden">
            <ChatPanel
              messages={messages}
              inputMessage={inputMessage}
              onInputChange={setInputMessage}
              onSendMessage={sendMessage}
              isGenerating={isGenerating}
            />
          </div>

          {/* Main Content Area - Independent scrolling - Full width on mobile, right panel on desktop */}
          <div className="flex-1 lg:flex-none lg:w-3/4 bg-black flex flex-col h-full overflow-hidden">
            {/* Content area with independent scroll */}
            <div className="flex-1 border border-white/20 rounded-lg m-2 lg:m-4 overflow-hidden">
              <div className="h-full overflow-y-auto scrollbar-thin smooth-scroll">
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
                  />
                ) : activeMenu === 'phone' ? (
                  <PhoneNumbersTab
                    project={project}
                    currentProject={currentProject}
                    user={user}
                    getProjectPhoneNumbers={getProjectPhoneNumbers}
                    onTestAgentClick={() => setShowTestTypeModal(true)}
                    onOutboundTestAPI={handleOutboundTestAPI}
                    setAvailableNumbers={setAvailablePhoneNumbers}
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
                      <div className="w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center mx-auto">
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
        onSelectNumber={(/* phoneNumber */) => {
          // Handle phone number selection
        }}
        userId={user?.id}
        projectId={project?.id || currentProject?.id}
      />
      
      {/* Test Type Selection Modal */}
      <TestTypeModal
        isOpen={showTestTypeModal}
        onClose={() => setShowTestTypeModal(false)}
        availablePhoneNumbers={availablePhoneNumbers}
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
        onVoiceCloned={async () => {
          // Refresh custom voices list immediately after cloning
          try {
            const customVoicesFromPlan = await getUserCustomVoices();
            setCustomVoices(customVoicesFromPlan);
            console.log('✅ Refreshed custom voices after cloning:', customVoicesFromPlan.length);
          } catch (error) {
            console.error('❌ Failed to refresh custom voices after cloning:', error);
          }
        }}
        projectId={project?.id || currentProject?.id}
      />
    </RoomContext.Provider>
  );
}