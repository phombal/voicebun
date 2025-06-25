import { useState, useRef, useEffect } from 'react';
import { clientDb } from '../lib/database/client-service';
import Image from 'next/image';

interface ProjectConfig {
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
  customFunctions: Array<{name: string; description: string; parameters: Record<string, any>; headers?: Record<string, string>; body?: any; url?: string}>;
  webhooksEnabled: boolean;
  webhookUrl: string | null;
  webhookEvents: string[];
  
  // Community Publishing Fields
  projectEmoji: string;
  projectPhoto: string | null;
  publicTitle: string;
  publicDescription: string;
  publicWelcomeMessage: string;
  showBranding: boolean;
  customBrandingText: string | null;
  customBrandingUrl: string | null;
}

interface FunctionsTabProps {
  projectConfig: ProjectConfig;
  setProjectConfig: React.Dispatch<React.SetStateAction<ProjectConfig>>;
  projectId: string;
}

export function FunctionsTab({ projectConfig, setProjectConfig, projectId }: FunctionsTabProps) {
  const [showFunctionDropdown, setShowFunctionDropdown] = useState(false);
  const [editingFunction, setEditingFunction] = useState<number | null>(null);
  const [configuringPreset, setConfiguringPreset] = useState<'calcom' | 'googlesheets' | 'makecom' | null>(null);
  const [testingFunction, setTestingFunction] = useState<number | null>(null);
  const [testParams, setTestParams] = useState<Record<string, any>>({});
  const [functionConfig, setFunctionConfig] = useState<{
    name: string;
    description: string;
    parameters: any;
    headers?: Record<string, string>;
    body?: any;
    url?: string;
    method?: string;
  } | null>(null);
  const [presetConfig, setPresetConfig] = useState<{
    // Cal.com config
    calcom_api_key?: string;
    cal_username?: string;
    event_type_slug?: string;
    default_duration?: number;
    default_timezone?: string;
    default_language?: string;
    default_location_type?: string;
    
    // Google Sheets config
    google_access_token?: string;
    spreadsheet_id?: string;
    sheet_range?: string;
    
    // Make.com config
    webhook_url?: string;
  }>({});
  const [functionViewMode, setFunctionViewMode] = useState<Record<number, 'simple' | 'complex'>>({});
  const [testResults, setTestResults] = useState<Record<number, { success: boolean; message: string; data?: any } | null>>({});
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);
  const functionDropdownRef = useRef<HTMLDivElement>(null);
  const functionsTabContainerRef = useRef<HTMLDivElement>(null);

  // Prevent scroll propagation to parent elements
  const handleScroll = (e: React.UIEvent) => {
    e.stopPropagation();
  };

  // Enhanced wheel event handling to completely isolate scrolling
  const handleWheel = (_e: React.WheelEvent) => {
    const container = functionsTabContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtTop = scrollTop === 0;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;

    // Always prevent propagation first
    _e.stopPropagation();

    // Only prevent default if we're at boundaries and trying to scroll beyond
    if ((isAtTop && _e.deltaY < 0) || (isAtBottom && _e.deltaY > 0)) {
      _e.preventDefault();
    }
  };

  // Prevent touch events from propagating
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  // Helper function to get logo for function type
  const getFunctionLogo = (functionName: string) => {
    if (functionName.includes('schedule') || functionName.includes('calcom') || functionName === 'schedule_meeting' || functionName === 'get_bookings') {
      return '/cal_logo.jpeg';
    } else if (functionName.includes('spreadsheet') || functionName.includes('sheets') || functionName === 'update_spreadsheet') {
      return '/google_sheets_logo.png';
    } else if (functionName.includes('automation') || functionName.includes('make') || functionName === 'trigger_automation') {
      return '/make_logo.png';
    }
    return null;
  };

  // Close dropdown when clicking outside
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

  // Save custom functions to database
  const saveFunctionsToDatabase = async (functions: any[]) => {
    try {
      console.log('Saving functions to database for project:', projectId);
      
      // First get the current project data to preserve any fields not in projectConfig
      const currentData = await clientDb.getProjectData(projectId);
      if (!currentData) {
        console.warn('No existing project data found, skipping database save');
        return;
      }
      
      // Save the complete function structure
      const dbFunctions = functions.map(func => ({
        name: func.name,
        description: func.description,
        parameters: func.parameters,
        headers: func.headers,
        body: func.body,
        url: func.url
      }));
      
      // Create a complete update object using current projectConfig state with database fallbacks
      const updateData = {
        // Use current projectConfig state first, then fall back to database values
        system_prompt: projectConfig.systemPrompt || currentData.system_prompt,
        agent_instructions: projectConfig.agentInstructions || currentData.agent_instructions || undefined,
        first_message_mode: projectConfig.firstMessageMode || currentData.first_message_mode,
        llm_provider: projectConfig.llmProvider || currentData.llm_provider,
        llm_model: projectConfig.llmModel || currentData.llm_model,
        llm_temperature: projectConfig.llmTemperature ?? currentData.llm_temperature,
        llm_max_response_length: projectConfig.llmMaxResponseLength || currentData.llm_max_response_length,
        stt_provider: projectConfig.sttProvider || currentData.stt_provider,
        stt_language: projectConfig.sttLanguage || currentData.stt_language,
        stt_quality: projectConfig.sttQuality || currentData.stt_quality,
        stt_processing_mode: projectConfig.sttProcessingMode || currentData.stt_processing_mode,
        stt_noise_suppression: projectConfig.sttNoiseSuppression ?? currentData.stt_noise_suppression,
        stt_auto_punctuation: projectConfig.sttAutoPunctuation ?? currentData.stt_auto_punctuation,
        tts_provider: projectConfig.ttsProvider || currentData.tts_provider,
        tts_voice: projectConfig.ttsVoice || currentData.tts_voice,
        phone_number: projectConfig.phoneNumber || currentData.phone_number || undefined,
        phone_inbound_enabled: projectConfig.phoneInboundEnabled ?? currentData.phone_inbound_enabled,
        phone_outbound_enabled: projectConfig.phoneOutboundEnabled ?? currentData.phone_outbound_enabled,
        phone_recording_enabled: projectConfig.phoneRecordingEnabled ?? currentData.phone_recording_enabled,
        response_latency_priority: projectConfig.responseLatencyPriority || currentData.response_latency_priority,
        knowledge_base_files: projectConfig.knowledgeBaseFiles as Array<{name: string; type: "pdf" | "txt" | "docx" | "csv" | "json"; content: string; size: number}> || currentData.knowledge_base_files,
        webhooks_enabled: projectConfig.webhooksEnabled ?? currentData.webhooks_enabled,
        webhook_url: projectConfig.webhookUrl || currentData.webhook_url || undefined,
        webhook_events: projectConfig.webhookEvents || currentData.webhook_events,
        
        // Update the function-related fields
        custom_functions: dbFunctions,
        functions_enabled: functions.length > 0
      };
      
      await clientDb.updateProjectData(projectId, updateData);
      
      console.log('Functions and complete project configuration saved successfully to database');
    } catch (error) {
      console.error('❌ Failed to save project configuration:', error);
      console.error('❌ Error details:', error);
      
      // Throw the error so the UI can show the user what went wrong
      throw new Error(`Failed to save project configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Test function with sample data
  const testFunction = async (functionIndex: number) => {
    if (!functionConfig) return;
    
    setTestingFunction(functionIndex);
    
    try {
      // Use test parameters instead of generating sample data
      const sampleData = { ...testParams };
      
      // Always merge in default values from function parameters, regardless of testParams
      if (functionConfig.parameters?.properties) {
        Object.entries(functionConfig.parameters.properties).forEach(([key, param]: [string, any]) => {
          // If no value is provided in testParams, use the default from function config or generate sample data
          if (!sampleData.hasOwnProperty(key) || sampleData[key] === '' || sampleData[key] === undefined) {
            if (param.default !== undefined && param.default !== '') {
              sampleData[key] = param.default;
              console.log(`Using default value for ${key}:`, param.default);
            } else {
              // Generate sample data if no default is provided
              switch (param.type) {
                case 'string':
                  if (key.includes('email')) {
                    sampleData[key] = 'test@example.com';
                  } else if (key.includes('name')) {
                    sampleData[key] = 'John Doe';
                  } else if (key.includes('phone')) {
                    sampleData[key] = '+1234567890';
                  } else if (key.includes('time') || key.includes('date')) {
                    sampleData[key] = new Date().toISOString();
                  } else if (key.includes('timezone')) {
                    sampleData[key] = 'America/New_York';
                  } else {
                    sampleData[key] = 'sample_value';
                  }
                  break;
                case 'integer':
                case 'number':
                  sampleData[key] = 123;
                  break;
                case 'boolean':
                  sampleData[key] = true;
                  break;
                case 'array':
                  sampleData[key] = ['sample', 'data'];
                  break;
                case 'object':
                  sampleData[key] = { sample: 'data' };
                  break;
                default:
                  sampleData[key] = 'sample_value';
              }
              console.log(`Generated sample data for ${key}:`, sampleData[key]);
            }
          } else {
            console.log(`Using test param value for ${key}:`, sampleData[key]);
          }
        });
      }
      
      console.log('Final sampleData before template replacement:', sampleData);
      
      // Replace template variables in URL and body
      let testUrl = functionConfig.url || '';
      let testBody: Record<string, any> = {};
      
      // Check if this is a GET request
      const isGetRequest = (functionConfig as any).method === 'GET';
      
      // Replace template variables in URL
      Object.entries(sampleData).forEach(([key, value]) => {
        const placeholder = `{{${key}}}`;
        testUrl = testUrl.replace(new RegExp(placeholder, 'g'), String(value));
      });
      
      // For GET requests, clean up empty query parameters
      if (isGetRequest && testUrl.includes('?')) {
        const [baseUrl, queryString] = testUrl.split('?');
        const params = new URLSearchParams(queryString);
        
        // Remove empty parameters
        const cleanParams = new URLSearchParams();
        params.forEach((value, key) => {
          if (value && value !== '' && value !== 'undefined' && value !== 'null') {
            cleanParams.append(key, value);
          }
        });
        
        testUrl = cleanParams.toString() ? `${baseUrl}?${cleanParams.toString()}` : baseUrl;
        console.log('GET request - URL processed:', testUrl);
      } else if (!isGetRequest) {
        // Only process body for non-GET requests
        testBody = { ...functionConfig.body };
        
        // Replace template variables in body
        const bodyString = JSON.stringify(testBody);
        let replacedBodyString = bodyString;
        Object.entries(sampleData).forEach(([key, value]) => {
          const placeholder = `"{{${key}}}"`;
          const quotedPlaceholder = `{{${key}}}`;
          // Handle null/undefined values properly
          if (value === null || value === undefined || value === '') {
            // Remove the entire property if the value is empty
            const propertyPattern = new RegExp(`"[^"]*":\\s*"{{${key}}}"[,]?`, 'g');
            replacedBodyString = replacedBodyString.replace(propertyPattern, '');
            // Clean up any trailing commas
            replacedBodyString = replacedBodyString.replace(/,(\s*[}\]])/g, '$1');
          } else {
            // Replace both quoted and unquoted placeholders
            replacedBodyString = replacedBodyString.replace(new RegExp(placeholder, 'g'), JSON.stringify(value));
            replacedBodyString = replacedBodyString.replace(new RegExp(quotedPlaceholder, 'g'), String(value));
          }
        });
        
        console.log('Original body:', testBody);
        console.log('Sample data:', sampleData);
        console.log('Replaced body string:', replacedBodyString);
        
        try {
          testBody = JSON.parse(replacedBodyString);
          console.log('Final test body:', testBody);
        } catch {
          // If parsing fails, keep original body
        }

        // Validate that array fields are actually arrays and object fields are objects
        if (functionConfig.parameters?.properties) {
          Object.entries(functionConfig.parameters.properties).forEach(([key, param]: [string, any]) => {
            if (testBody.hasOwnProperty(key)) {
              if (param.type === 'array' && !Array.isArray(testBody[key])) {
                console.warn(`Converting ${key} from ${typeof testBody[key]} to array`);
                try {
                  testBody[key] = typeof testBody[key] === 'string' ? JSON.parse(testBody[key]) : [testBody[key]];
                } catch {
                  testBody[key] = [testBody[key]];
                }
              } else if (param.type === 'object' && typeof testBody[key] !== 'object') {
                console.warn(`Converting ${key} from ${typeof testBody[key]} to object`);
                try {
                  testBody[key] = typeof testBody[key] === 'string' ? JSON.parse(testBody[key]) : {};
                } catch {
                  testBody[key] = {};
                }
              }
            }
          });
        }

        // Also validate nested objects like attendee
        if (testBody.attendee) {
          Object.entries(testBody.attendee).forEach(([key, value]) => {
            if (key === 'guests' && typeof value === 'string') {
              try {
                testBody.attendee[key] = JSON.parse(value);
              } catch {
                testBody.attendee[key] = [value];
              }
            }
          });
        }

        // Handle guests field specifically (should be array)
        if (testBody.guests && typeof testBody.guests === 'string') {
          try {
            testBody.guests = JSON.parse(testBody.guests);
          } catch {
            testBody.guests = testBody.guests ? [testBody.guests] : [];
          }
        }

        console.log('Final validated test body before API call:', JSON.stringify(testBody, null, 2));
      }

      // Validate required fields
      const missingFields: string[] = [];
      if (functionConfig.parameters?.required) {
        functionConfig.parameters.required.forEach((field: string) => {
          if (!sampleData[field] || sampleData[field] === 'sample_value') {
            missingFields.push(field);
          }
        });
      }

      if (missingFields.length > 0) {
        setTestResults(prev => ({
          ...prev,
          [functionIndex]: {
            success: false,
            message: `Missing required configuration: ${missingFields.join(', ')}. Please configure these fields before testing.`,
          }
        }));
        return;
      }

      // Simulate API call (we won't actually make the call to avoid side effects)
      if (!testUrl || testUrl.includes('{{') || testUrl === 'https://api.example.com/webhook') {
        setTestResults(prev => ({
          ...prev,
          [functionIndex]: {
            success: false,
            message: 'Please configure a valid API URL before testing.',
          }
        }));
        return;
      }

      // Check if headers contain placeholder values
      const hasPlaceholderHeaders = Object.values(functionConfig.headers || {}).some(value => 
        typeof value === 'string' && (value.includes('YOUR_') || value.includes('{{'))
      );

      if (hasPlaceholderHeaders) {
        setTestResults(prev => ({
          ...prev,
          [functionIndex]: {
            success: false,
            message: 'Please replace placeholder values in headers (API keys, tokens, etc.) before testing.',
          }
        }));
        return;
      }

      // Make actual API call
      try {
        // Check if this is a GET request
        const isGetRequest = (functionConfig as any).method === 'GET';
        
        console.log('Function config method:', (functionConfig as any).method);
        console.log('Is GET request:', isGetRequest);
        console.log('Function config body:', functionConfig.body);
        console.log('Test body:', testBody);
        
        const fetchOptions: RequestInit = {
          method: isGetRequest ? 'GET' : 'POST',
          headers: {
            ...functionConfig.headers
          }
        };
        
        // Only add Content-Type and body for POST requests
        if (!isGetRequest) {
          fetchOptions.headers = {
            'Content-Type': 'application/json',
            ...functionConfig.headers
          };
          fetchOptions.body = JSON.stringify(testBody);
        }
        
        console.log('Final fetch options:', fetchOptions);
        console.log('Request URL:', testUrl);
        
        const response = await fetch(testUrl, fetchOptions);

        const responseData = await response.text();
        let parsedResponse;
        try {
          parsedResponse = JSON.parse(responseData);
        } catch {
          parsedResponse = responseData;
        }

        if (response.ok) {
          setTestResults(prev => ({
            ...prev,
            [functionIndex]: {
              success: true,
              message: `API call successful! Status: ${response.status} ${response.statusText}`,
              data: {
                url: testUrl,
                headers: functionConfig.headers,
                body: testBody,
                sampleData: sampleData,
                response: parsedResponse,
                status: response.status
              }
            }
          }));
        } else {
          setTestResults(prev => ({
            ...prev,
            [functionIndex]: {
              success: false,
              message: `API call failed! Status: ${response.status} ${response.statusText}. Response: ${typeof parsedResponse === 'string' ? parsedResponse : JSON.stringify(parsedResponse)}`,
              data: {
                url: testUrl,
                headers: functionConfig.headers,
                body: testBody,
                sampleData: sampleData,
                response: parsedResponse,
                status: response.status
              }
            }
          }));
        }
      } catch (fetchError) {
        setTestResults(prev => ({
          ...prev,
          [functionIndex]: {
            success: false,
            message: `Network error: ${fetchError instanceof Error ? fetchError.message : 'Unknown network error'}`,
            data: {
              url: testUrl,
              headers: functionConfig.headers,
              body: testBody,
              sampleData: sampleData
            }
          }
        }));
      }

    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [functionIndex]: {
          success: false,
          message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }
      }));
    }
  };

  // Test webhook with sample data
  const testWebhook = async () => {
    if (!projectConfig.webhookUrl) {
      setWebhookTestResult({
        success: false,
        message: 'Please enter a webhook URL first.'
      });
      return;
    }

    setTestingWebhook(true);
    setWebhookTestResult(null);

    try {
      // Create sample webhook payload similar to the competitor's format
      const samplePayload = {
        event: "call_ended",
        call: {
          call_type: "phone_call",
          from_number: "+12137771234",
          to_number: "+12137771235",
          direction: "inbound",
          call_id: "test_call_" + Date.now(),
          agent_id: projectId,
          call_status: "completed",
          metadata: {
            test_webhook: true,
            timestamp: new Date().toISOString()
          },
          dynamic_variables: {
            customer_name: "Test Customer"
          },
          start_timestamp: Date.now() - 60000, // 1 minute ago
          end_timestamp: Date.now(),
          disconnection_reason: "user_hangup",
          transcript: "Agent: Hello, how can I help you today?\nCustomer: Hi, I was calling to test the webhook functionality.\nAgent: Great! This is a test call to verify the webhook is working properly.\nCustomer: Perfect, thank you!\nAgent: You're welcome! Have a great day.",
          transcript_object: [
            { role: "agent", content: "Hello, how can I help you today?", timestamp: Date.now() - 45000 },
            { role: "user", content: "Hi, I was calling to test the webhook functionality.", timestamp: Date.now() - 40000 },
            { role: "agent", content: "Great! This is a test call to verify the webhook is working properly.", timestamp: Date.now() - 35000 },
            { role: "user", content: "Perfect, thank you!", timestamp: Date.now() - 30000 },
            { role: "agent", content: "You're welcome! Have a great day.", timestamp: Date.now() - 25000 }
          ],
          opt_out_sensitive_data_storage: false
        }
      };

      console.log('Testing webhook with payload:', samplePayload);

      const response = await fetch(projectConfig.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'VoiceAgent-Webhook/1.0'
        },
        body: JSON.stringify(samplePayload)
      });

      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }

      if (response.ok) {
        setWebhookTestResult({
          success: true,
          message: `Webhook test successful! Status: ${response.status} ${response.statusText}`,
          data: {
            status: response.status,
            response: responseData,
            payload: samplePayload
          }
        });
      } else {
        setWebhookTestResult({
          success: false,
          message: `Webhook test failed! Status: ${response.status} ${response.statusText}. Response: ${typeof responseData === 'string' ? responseData : JSON.stringify(responseData)}`,
          data: {
            status: response.status,
            response: responseData,
            payload: samplePayload
          }
        });
      }
    } catch (error) {
      setWebhookTestResult({
        success: false,
        message: `Webhook test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setTestingWebhook(false);
    }
  };

  const addCalComIntegration = () => {
    const calcomFunction = {
      name: 'schedule_meeting',
      description: 'Schedule a meeting using Cal.com',
      url: 'https://api.cal.com/v2/bookings',
      headers: {
        'Content-Type': 'application/json',
        'cal-api-version': '2024-08-13',
        'Authorization': 'Bearer YOUR_CAL_API_KEY'
      },
      method: 'POST',
      body: {
        "attendee": {
          "language": "{{language}}",
          "timeZone": "{{timezone}}",
          "name": "{{attendee_name}}",
          "email": "{{attendee_email}}"
        },
        "start": "{{start_time}}",
        "eventTypeSlug": "{{event_type_slug}}",
        "username": "{{cal_username}}"
      },
      parameters: {
        type: 'object',
        properties: {
          start_time: {
            type: 'string',
            description: 'Meeting start time in ISO 8601 format (e.g., 2025-06-20T20:00:00Z)'
          },
          attendee_name: {
            type: 'string',
            description: 'Name of the person scheduling the meeting'
          },
          attendee_email: {
            type: 'string',
            description: 'Email address of the attendee'
          },
          timezone: {
            type: 'string',
            description: 'Timezone of the attendee (e.g., America/Los_Angeles)',
            default: 'America/Los_Angeles'
          },
          language: {
            type: 'string',
            description: 'Language preference (e.g., en, es, fr)',
            default: 'en'
          },
          event_type_slug: {
            type: 'string',
            description: 'Slug of the Cal.com event type (e.g., 30min)',
            default: '30min'
          },
          cal_username: {
            type: 'string',
            description: 'Cal.com username of the host',
            default: ''
          }
        },
        required: ['start_time', 'attendee_name', 'attendee_email', 'event_type_slug', 'cal_username']
      }
    };

    const updatedFunctions = [...projectConfig.customFunctions, calcomFunction];
    setProjectConfig(prev => ({ ...prev, customFunctions: updatedFunctions }));
    saveFunctionsToDatabase(updatedFunctions);
  };

  const addCalComGetBookingsIntegration = () => {
    const calcomGetBookingsFunction = {
      name: 'get_bookings',
      description: 'Get existing bookings from Cal.com with optional filters',
      url: 'https://api.cal.com/v2/bookings?take={{take}}&skip={{skip}}',
      headers: {
        'cal-api-version': '2024-08-13',
        'Authorization': 'Bearer YOUR_CAL_API_KEY'
      },
      method: 'GET',
      parameters: {
        type: 'object',
        properties: {
          take: {
            type: 'integer',
            description: 'Number of bookings to return (max 100)',
            default: 10
          },
          skip: {
            type: 'integer', 
            description: 'Number of bookings to skip for pagination',
            default: 0
          }
        },
        required: []
      }
    };

    const updatedFunctions = [...projectConfig.customFunctions, calcomGetBookingsFunction];
    setProjectConfig(prev => ({ ...prev, customFunctions: updatedFunctions }));
    saveFunctionsToDatabase(updatedFunctions);
  };

  const addCustomFunction = () => {
    const customFunction = {
      name: 'custom_function',
      description: 'Custom function description',
      url: 'https://api.example.com/webhook',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_API_KEY'
      },
      method: 'POST',
      body: {
        "data": "{{input_data}}",
        "action": "process"
      },
      parameters: {
        type: 'object',
        properties: {
          input_data: {
            type: 'string',
            description: 'Data to send to the API'
          }
        },
        required: ['input_data']
      }
    };
    
    const updatedFunctions = [...(projectConfig.customFunctions || []), customFunction];
    setProjectConfig(prev => ({
      ...prev,
      customFunctions: updatedFunctions,
      functionsEnabled: updatedFunctions.length > 0
    }));
    // Save to database
    saveFunctionsToDatabase(updatedFunctions);
    
    // Immediately start editing the new function
    const newFunctionIndex = updatedFunctions.length - 1;
    setEditingFunction(newFunctionIndex);
    setFunctionConfig({
      name: customFunction.name,
      description: customFunction.description,
      parameters: customFunction.parameters,
      headers: customFunction.headers || {},
      body: customFunction.body || {},
      url: customFunction.url || '',
      method: customFunction.method || 'POST'
    });
    // Set initial view mode to simple
    setFunctionViewMode(prev => ({
      ...prev,
      [newFunctionIndex]: 'simple'
    }));
    
    setShowFunctionDropdown(false);
  };

  const savePresetFunction = () => {
    if (configuringPreset === 'calcom') {
      const calcomFunction = {
        name: 'schedule_meeting',
        description: 'Schedule a meeting using Cal.com',
        url: 'https://api.cal.com/v2/bookings',
        headers: {
          'Content-Type': 'application/json',
          'cal-api-version': '2024-08-13',
          'Authorization': `Bearer ${presetConfig.calcom_api_key || 'YOUR_CAL_API_KEY'}`
        },
        method: 'POST',
        body: {
          "attendee": {
            "language": "{{language}}",
            "timeZone": "{{timezone}}",
            "name": "{{attendee_name}}",
            "email": "{{attendee_email}}"
          },
          "start": "{{start_time}}",
          "eventTypeSlug": "{{event_type_slug}}",
          "username": "{{cal_username}}"
        },
        parameters: {
          type: 'object',
          properties: {
            start_time: {
              type: 'string',
              description: 'Meeting start time in ISO 8601 format (e.g., 2025-06-20T20:00:00Z)'
            },
            attendee_name: {
              type: 'string',
              description: 'Name of the person scheduling the meeting'
            },
            attendee_email: {
              type: 'string',
              description: 'Email address of the attendee'
            },
            timezone: {
              type: 'string',
              description: 'Timezone of the attendee (e.g., America/Los_Angeles)',
              default: presetConfig.default_timezone || 'America/Los_Angeles'
            },
            language: {
              type: 'string',
              description: 'Language preference (e.g., en, es, fr)',
              default: presetConfig.default_language || 'en'
            },
            event_type_slug: {
              type: 'string',
              description: 'Slug of the Cal.com event type (e.g., 30min)',
              default: presetConfig.event_type_slug || '30min'
            },
            cal_username: {
              type: 'string',
              description: 'Cal.com username of the host',
              default: presetConfig.cal_username || ''
            }
          },
          required: ['start_time', 'attendee_name', 'attendee_email', 'event_type_slug', 'cal_username']
        }
      };
      const updatedFunctions = [...(projectConfig.customFunctions || []), calcomFunction];
      setProjectConfig(prev => ({
        ...prev,
        customFunctions: updatedFunctions,
        functionsEnabled: updatedFunctions.length > 0
      }));
      // Save to database
      saveFunctionsToDatabase(updatedFunctions);
      
      // Immediately start editing the new function
      const newFunctionIndex = updatedFunctions.length - 1;
      setEditingFunction(newFunctionIndex);
      setFunctionConfig({
        name: calcomFunction.name,
        description: calcomFunction.description,
        parameters: calcomFunction.parameters,
        headers: calcomFunction.headers || {},
        body: calcomFunction.body || {},
        url: calcomFunction.url || ''
      });
      // Set initial view mode to simple
      setFunctionViewMode(prev => ({
        ...prev,
        [newFunctionIndex]: 'simple'
      }));
    } else if (configuringPreset === 'googlesheets') {
      const googleSheetsFunction = {
        name: 'update_spreadsheet',
        description: 'Add or update data in a Google Sheets spreadsheet',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${presetConfig.spreadsheet_id || '{{spreadsheet_id}}'}/values/${presetConfig.sheet_range || '{{range}}'}:append`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${presetConfig.google_access_token || 'YOUR_GOOGLE_SHEETS_ACCESS_TOKEN'}`
        },
        body: {
          "valueInputOption": "USER_ENTERED",
          "values": [
            "{{row_data}}"
          ]
        },
        parameters: {
          type: 'object',
          properties: {
            row_data: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Array of values to add as a new row'
            }
          },
          required: ['row_data']
        }
      };
      const updatedFunctions = [...(projectConfig.customFunctions || []), googleSheetsFunction];
      setProjectConfig(prev => ({
        ...prev,
        customFunctions: updatedFunctions,
        functionsEnabled: updatedFunctions.length > 0
      }));
      // Save to database
      saveFunctionsToDatabase(updatedFunctions);
      
      // Immediately start editing the new function
      const newFunctionIndex = updatedFunctions.length - 1;
      setEditingFunction(newFunctionIndex);
      setFunctionConfig({
        name: googleSheetsFunction.name,
        description: googleSheetsFunction.description,
        parameters: googleSheetsFunction.parameters,
        headers: googleSheetsFunction.headers || {},
        body: googleSheetsFunction.body || {},
        url: googleSheetsFunction.url || ''
      });
      // Set initial view mode to simple
      setFunctionViewMode(prev => ({
        ...prev,
        [newFunctionIndex]: 'simple'
      }));
    } else if (configuringPreset === 'makecom') {
      const makecomFunction = {
        name: 'trigger_automation',
        description: 'Trigger a Make.com automation workflow',
        url: presetConfig.webhook_url || '{{webhook_url}}',
        headers: {
          'Content-Type': 'application/json'
        },
        body: {
          "trigger_data": "{{workflow_data}}",
          "timestamp": "{{timestamp}}",
          "source": "voice_agent"
        },
        parameters: {
          type: 'object',
          properties: {
            workflow_data: {
              type: 'object',
              description: 'Data to send to the Make.com workflow'
            },
            timestamp: {
              type: 'string',
              description: 'ISO timestamp of when the trigger occurred',
              default: 'auto_generated'
            }
          },
          required: ['workflow_data']
        }
      };
      const updatedFunctions = [...(projectConfig.customFunctions || []), makecomFunction];
      setProjectConfig(prev => ({
        ...prev,
        customFunctions: updatedFunctions,
        functionsEnabled: updatedFunctions.length > 0
      }));
      // Save to database
      saveFunctionsToDatabase(updatedFunctions);
      
      // Immediately start editing the new function
      const newFunctionIndex = updatedFunctions.length - 1;
      setEditingFunction(newFunctionIndex);
      setFunctionConfig({
        name: makecomFunction.name,
        description: makecomFunction.description,
        parameters: makecomFunction.parameters,
        headers: makecomFunction.headers || {},
        body: makecomFunction.body || {},
        url: makecomFunction.url || ''
      });
      // Set initial view mode to simple
      setFunctionViewMode(prev => ({
        ...prev,
        [newFunctionIndex]: 'simple'
      }));
    }
    
    setConfiguringPreset(null);
    setPresetConfig({});
  };

  const addHangupCallFunction = () => {
    const hangupFunction = {
      name: 'hangup_call',
      description: 'End the call when the agent deems appropriate',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    };
    
    const updatedFunctions = [...(projectConfig.customFunctions || []), hangupFunction];
    setProjectConfig(prev => ({
      ...prev,
      customFunctions: updatedFunctions,
      functionsEnabled: updatedFunctions.length > 0
    }));
    // Save to database
    saveFunctionsToDatabase(updatedFunctions);
    setShowFunctionDropdown(false);
  };

  const addVoicemailDetectionFunction = () => {
    const voicemailFunction = {
      name: 'voicemail_detection',
      description: 'Detect when the call goes to voicemail and handle accordingly',
      parameters: {
        type: 'object',
        properties: {
          voicemail_message: {
            type: 'string',
            description: 'Message to say when voicemail is detected',
            default: 'Hello, I noticed this call went to voicemail. I\'ll leave a brief message and follow up later.'
          }
        },
        required: []
      }
    };
    
    const updatedFunctions = [...(projectConfig.customFunctions || []), voicemailFunction];
    setProjectConfig(prev => ({
      ...prev,
      customFunctions: updatedFunctions,
      functionsEnabled: updatedFunctions.length > 0
    }));
    // Save to database
    saveFunctionsToDatabase(updatedFunctions);
    setShowFunctionDropdown(false);
  };

  return (
    <div className="h-full bg-black overflow-y-auto" ref={functionsTabContainerRef} onScroll={handleScroll} onWheel={handleWheel} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      {/* Combined Functions Configuration Section */}
      <div className="bg-white/10 backdrop-blur-sm min-h-full p-8 pb-24 w-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <svg className="w-6 h-6 mr-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <h3 className="text-xl font-semibold text-white">Functions</h3>
          </div>
          <div className="relative" ref={functionDropdownRef}>
            <button
              onClick={() => setShowFunctionDropdown(!showFunctionDropdown)}
              className="px-4 py-2 bg-white hover:bg-gray-100 text-black font-medium rounded-lg transition-colors flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Function</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showFunctionDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-10">
                <div className="px-4 py-2 text-sm text-gray-500 border-b border-gray-100">
                  Choose an integration
                </div>
                
                {/* Built-in Voice Agent Functions */}
                <button
                  onClick={addHangupCallFunction}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center space-x-3 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-100">
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 22V12h6v10" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Hangup Call</div>
                    <div className="text-xs text-gray-500">End the current call immediately</div>
                  </div>
                </button>
                
                <button
                  onClick={addVoicemailDetectionFunction}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center space-x-3 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-100">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Voicemail Detection</div>
                    <div className="text-xs text-gray-500">Detect when call goes to voicemail</div>
                  </div>
                </button>

                <div className="border-t border-gray-100 my-2"></div>
                
                <button
                  onClick={addCalComIntegration}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center space-x-3 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
                    <Image src="/cal_logo.jpeg" alt="Cal.com" width={32} height={32} className="object-cover rounded-lg" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Cal.com Make Bookings</div>
                    <div className="text-xs text-gray-500">Schedule meetings (requires API key)</div>
                  </div>
                </button>
                
                <button
                  onClick={addCalComGetBookingsIntegration}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center space-x-3 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
                    <Image src="/cal_logo.jpeg" alt="Cal.com" width={32} height={32} className="object-cover rounded-lg" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Cal.com Get Bookings</div>
                    <div className="text-xs text-gray-500">Retrieve existing bookings (requires API key)</div>
                  </div>
                </button>

                <div className="border-t border-gray-100 my-2"></div>
                
                <button
                  onClick={addCustomFunction}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center space-x-3 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Custom Function</div>
                    <div className="text-xs text-gray-500">Create your own API integration</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Preset Function Configuration */}
        {configuringPreset && (
          <div className="bg-white/5 rounded-lg border border-white/20 p-6 mb-6">
            {configuringPreset === 'calcom' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center mr-3">
                      <div className="w-5 h-5 bg-orange-500 rounded"></div>
                    </div>
                    <h4 className="text-lg font-medium text-white">Configure Cal.com Integration</h4>
                  </div>
                  <button
                    onClick={() => {
                      setConfiguringPreset(null);
                      setPresetConfig({});
                    }}
                    className="text-white/70 hover:text-white"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      Cal.com API Key *
                    </label>
                    <input
                      type="password"
                      value={presetConfig.calcom_api_key || ''}
                      onChange={(e) => setPresetConfig(prev => ({ ...prev, calcom_api_key: e.target.value }))}
                      placeholder="Enter your Cal.com API key"
                      className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <p className="text-xs text-white/50 mt-1">Get this from Cal.com → Settings → Developer → API Keys</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white/70 mb-2">
                        Your Cal.com Username *
                      </label>
                      <input
                        type="text"
                        value={presetConfig.cal_username || ''}
                        onChange={(e) => setPresetConfig(prev => ({ ...prev, cal_username: e.target.value }))}
                        placeholder="your-username"
                        className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-white/70 mb-2">
                        Event Type Slug *
                      </label>
                      <input
                        type="text"
                        value={presetConfig.event_type_slug || ''}
                        onChange={(e) => setPresetConfig(prev => ({ ...prev, event_type_slug: e.target.value }))}
                        placeholder="30min"
                        className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      Default Duration (minutes)
                    </label>
                    <input
                      type="number"
                      value={presetConfig.default_duration || 30}
                      onChange={(e) => setPresetConfig(prev => ({ ...prev, default_duration: parseInt(e.target.value) }))}
                      className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white/70 mb-2">
                        Default Location Type
                      </label>
                      <select
                        value={presetConfig.default_location_type || 'zoom'}
                        onChange={(e) => setPresetConfig(prev => ({ ...prev, default_location_type: e.target.value }))}
                        className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="zoom">Zoom</option>
                        <option value="meet">Google Meet</option>
                        <option value="teams">Microsoft Teams</option>
                        <option value="phone">Phone Call</option>
                        <option value="address">In Person</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-white/70 mb-2">
                        Default Language
                      </label>
                      <select
                        value={presetConfig.default_language || 'en'}
                        onChange={(e) => setPresetConfig(prev => ({ ...prev, default_language: e.target.value }))}
                        className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="en">English</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                        <option value="de">German</option>
                        <option value="it">Italian</option>
                        <option value="pt">Portuguese</option>
                        <option value="ja">Japanese</option>
                        <option value="ko">Korean</option>
                        <option value="zh">Chinese</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {configuringPreset === 'googlesheets' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                      <div className="w-5 h-5 bg-green-500 rounded"></div>
                    </div>
                    <h4 className="text-lg font-medium text-white">Configure Google Sheets Integration</h4>
                  </div>
                  <button
                    onClick={() => {
                      setConfiguringPreset(null);
                      setPresetConfig({});
                    }}
                    className="text-white/70 hover:text-white"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      Google Sheets Access Token *
                    </label>
                    <input
                      type="password"
                      value={presetConfig.google_access_token || ''}
                      onChange={(e) => setPresetConfig(prev => ({ ...prev, google_access_token: e.target.value }))}
                      placeholder="Enter your Google Sheets access token"
                      className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <p className="text-xs text-white/50 mt-1">Set up OAuth 2.0 in Google Cloud Console</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      Spreadsheet ID *
                    </label>
                    <input
                      type="text"
                      value={presetConfig.spreadsheet_id || ''}
                      onChange={(e) => setPresetConfig(prev => ({ ...prev, spreadsheet_id: e.target.value }))}
                      placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                      className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <p className="text-xs text-white/50 mt-1">Found in the Google Sheets URL</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      Sheet Range
                    </label>
                    <input
                      type="text"
                      value={presetConfig.sheet_range || 'Sheet1!A:Z'}
                      onChange={(e) => setPresetConfig(prev => ({ ...prev, sheet_range: e.target.value }))}
                      placeholder="Sheet1!A:Z"
                      className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>
              </div>
            )}
            
            {configuringPreset === 'makecom' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                      <div className="w-5 h-5 bg-purple-500 rounded"></div>
                    </div>
                    <h4 className="text-lg font-medium text-white">Configure Make.com Integration</h4>
                  </div>
                  <button
                    onClick={() => {
                      setConfiguringPreset(null);
                      setPresetConfig({});
                    }}
                    className="text-white/70 hover:text-white"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      Webhook URL *
                    </label>
                    <input
                      type="url"
                      value={presetConfig.webhook_url || ''}
                      onChange={(e) => setPresetConfig(prev => ({ ...prev, webhook_url: e.target.value }))}
                      placeholder="https://hook.make.com/..."
                      className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <p className="text-xs text-white/50 mt-1">Create a scenario with a webhook trigger in Make.com</p>
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex items-center justify-end space-x-3 pt-6 mt-6 border-t border-white/20">
              <button
                onClick={() => {
                  setConfiguringPreset(null);
                  setPresetConfig({});
                }}
                className="px-4 py-2 text-white/70 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={savePresetFunction}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Add Function
              </button>
            </div>
          </div>
        )}
        
        {/* Functions Content Area */}
        <div className="space-y-6">
          {(projectConfig.customFunctions || []).length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <h4 className="text-lg font-medium text-white mb-2">No Functions Yet</h4>
              <p className="text-white/70 mb-6">Add your first function using the dropdown above to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h4 className="text-lg font-medium text-white">Custom Functions</h4>
              {(projectConfig.customFunctions || []).map((func: any, index: number) => (
                <div key={index} className="bg-white/5 rounded-lg border border-white/20 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex-1 flex items-center space-x-3">
                      {/* Function Logo */}
                      {getFunctionLogo(func.name) && (
                        <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
                          <Image 
                            src={getFunctionLogo(func.name)!} 
                            alt={func.name} 
                            width={32}
                            height={32}
                            className="object-cover rounded-lg" 
                          />
                        </div>
                      )}
                      <div>
                        <h5 className="text-white font-medium">{func.name}</h5>
                        <p className="text-white/70 text-sm">{func.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {/* Only show Configure button for functions that need configuration */}
                      {func.name !== 'hangup_call' && (
                        <button
                          onClick={() => {
                            setEditingFunction(index);
                            setTestingFunction(null); // Ensure we're in Configure mode
                            setFunctionConfig({
                              name: func.name,
                              description: func.description,
                              parameters: func.parameters,
                              headers: (func as any).headers || {},
                              body: (func as any).body || {},
                              url: (func as any).url || '',
                              method: (func as any).method || (func.name === 'get_bookings' ? 'GET' : 'POST')
                            });
                          }}
                          className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                        >
                          Configure
                        </button>
                      )}
                      {/* Only show test button for preset integrations, not custom functions, hangup_call, or voicemail_detection */}
                      {!func.name.includes('custom_function') && func.name !== 'hangup_call' && func.name !== 'voicemail_detection' && (
                        <button
                          onClick={() => {
                            setEditingFunction(index);
                            setTestingFunction(index); // Set to Test mode
                            setFunctionConfig({
                              name: func.name,
                              description: func.description,
                              parameters: func.parameters,
                              headers: (func as any).headers || {},
                              body: (func as any).body || {},
                              url: (func as any).url || '',
                              method: (func as any).method || (func.name === 'get_bookings' ? 'GET' : 'POST')
                            });
                            // Initialize test params with default values
                            const initialParams: Record<string, any> = {};
                            if (func.parameters?.properties) {
                              Object.entries(func.parameters.properties).forEach(([key, param]: [string, any]) => {
                                // First priority: use the parameter's default value if it exists
                                if (param.default !== undefined && param.default !== '') {
                                  initialParams[key] = param.default;
                                } else if (key === 'timezone') {
                                  initialParams[key] = 'America/New_York';
                                } else if (key === 'language') {
                                  initialParams[key] = 'en';
                                } else if (key.includes('email')) {
                                  initialParams[key] = 'test@example.com';
                                } else if (key.includes('name')) {
                                  initialParams[key] = 'John Doe';
                                } else if (key.includes('phone')) {
                                  initialParams[key] = '+1234567890';
                                } else if (key.includes('time') || key.includes('date') || key.includes('start')) {
                                  const futureDate = new Date();
                                  futureDate.setDate(futureDate.getDate() + 1);
                                  futureDate.setHours(14, 0, 0, 0); // 2 PM tomorrow
                                  initialParams[key] = futureDate.toISOString();
                                } else if (param.type === 'object') {
                                  if (key === 'metadata') {
                                    initialParams[key] = { source: 'voice_agent', test: true };
                                  } else if (key.includes('custom_field')) {
                                    initialParams[key] = { field1: 'value1' };
                                  } else {
                                    initialParams[key] = param.default || {};
                                  }
                                } else if (param.type === 'array') {
                                  if (key.includes('email') || key.includes('guest')) {
                                    initialParams[key] = [];
                                  } else {
                                    initialParams[key] = param.default || [];
                                  }
                                } else if (param.type === 'integer' || param.type === 'number') {
                                  if (key.includes('duration')) {
                                    initialParams[key] = 30;
                                  } else if (key.includes('id')) {
                                    initialParams[key] = 123456;
                                  } else {
                                    initialParams[key] = param.default || 0;
                                  }
                                } else {
                                  initialParams[key] = param.default || '';
                                }
                              });
                            }
                            setTestParams(initialParams);
                          }}
                          className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                        >
                          Test
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const updatedFunctions = (projectConfig.customFunctions || []).filter((_: any, i: number) => i !== index);
                          setProjectConfig(prev => ({
                            ...prev,
                            customFunctions: updatedFunctions,
                            functionsEnabled: updatedFunctions.length > 0
                          }));
                          // Save to database
                          saveFunctionsToDatabase(updatedFunctions);
                        }}
                        className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  
                  {/* Tabbed Interface for Configure/Test */}
                  {editingFunction === index && functionConfig && (
                    <div className="mt-4 pt-4 border-t border-white/20">
                      {/* Simple/Complex Toggle - Only show in Configure tab */}
                      {testingFunction !== index && (
                        <div className="flex items-center justify-between mb-6">
                          <h6 className="text-lg font-medium text-white">Configure Function</h6>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-white/70">Simple</span>
                            <button
                              onClick={() => {
                                setFunctionViewMode(prev => ({
                                  ...prev,
                                  [index]: prev[index] === 'complex' ? 'simple' : 'complex'
                                }));
                              }}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black ${
                                functionViewMode[index] === 'complex' ? 'bg-blue-600' : 'bg-white/20'
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                  functionViewMode[index] === 'complex' ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                            <span className="text-sm text-white/70">Complex</span>
                          </div>
                        </div>
                      )}

                      {/* Test Tab Header */}
                      {testingFunction === index && (
                        <div className="flex items-center justify-between mb-6">
                          <h6 className="text-lg font-medium text-white">Test Function</h6>
                        </div>
                      )}

                      {/* Configure Tab Content */}
                      {testingFunction !== index && (
                        <div>
                          {/* Simple View - User-friendly form fields */}
                          {functionViewMode[index] !== 'complex' && (
                            <div className="space-y-4">
                              {/* Function Name */}
                              <div>
                                <label className="block text-sm font-medium text-white/70 mb-2">
                                  Function Name
                                </label>
                                <input
                                  type="text"
                                  value={functionConfig.name}
                                  onChange={(e) => setFunctionConfig(prev => prev ? { ...prev, name: e.target.value } : null)}
                                  className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              
                              {/* Function Description */}
                              <div>
                                <label className="block text-sm font-medium text-white/70 mb-2">
                                  Description
                                </label>
                                <textarea
                                  value={functionConfig.description}
                                  onChange={(e) => setFunctionConfig(prev => prev ? { ...prev, description: e.target.value } : null)}
                                  className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  rows={2}
                                />
                              </div>

                              {/* API URL */}
                              {(functionConfig.url || func.name.includes('custom_function')) && (
                                <div>
                                  <label className="block text-sm font-medium text-white/70 mb-2">
                                    API {func.name.includes('custom_function') ? 'URL' : 'Endpoint'}
                                  </label>
                                  <input
                                    type="text"
                                    value={functionConfig.url || ''}
                                    onChange={(e) => setFunctionConfig(prev => prev ? { ...prev, url: e.target.value } : null)}
                                    placeholder="https://api.example.com/webhook"
                                    className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                              )}

                              {/* Simple form fields based on function type */}
                              {(func.name.includes('schedule') || func.name.includes('calcom') || func.name === 'get_bookings') ? (
                                <div className="space-y-3">
                                  <div>
                                    <label className="block text-sm font-medium text-white/70 mb-2">
                                      Cal.com API Key
                                    </label>
                                    <input
                                      type="password"
                                      value={functionConfig.headers?.Authorization?.replace('Bearer ', '') || ''}
                                      onChange={(e) => setFunctionConfig(prev => prev ? { 
                                        ...prev, 
                                        headers: { ...prev.headers, Authorization: `Bearer ${e.target.value}` }
                                      } : null)}
                                      placeholder="Enter your Cal.com API key"
                                      className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                  {func.name === 'schedule_meeting' && (
                                    <>
                                      <div className="grid grid-cols-2 gap-3">
                                        <div>
                                          <label className="block text-sm font-medium text-white/70 mb-2">
                                            Cal.com Username
                                          </label>
                                          <input
                                            type="text"
                                            value={functionConfig.parameters?.properties?.cal_username?.default || ''}
                                            onChange={(e) => setFunctionConfig(prev => prev ? { 
                                              ...prev, 
                                              parameters: {
                                                ...prev.parameters,
                                                properties: {
                                                  ...prev.parameters.properties,
                                                  cal_username: {
                                                    ...prev.parameters.properties.cal_username,
                                                    default: e.target.value
                                                  }
                                                }
                                              }
                                            } : null)}
                                            placeholder="your-username"
                                            className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-sm font-medium text-white/70 mb-2">
                                            Event Type Slug
                                          </label>
                                          <input
                                            type="text"
                                            value={functionConfig.parameters?.properties?.event_type_slug?.default || ''}
                                            onChange={(e) => setFunctionConfig(prev => prev ? { 
                                              ...prev, 
                                              parameters: {
                                                ...prev.parameters,
                                                properties: {
                                                  ...prev.parameters.properties,
                                                  event_type_slug: {
                                                    ...prev.parameters.properties.event_type_slug,
                                                    default: e.target.value
                                                  }
                                                }
                                              }
                                            } : null)}
                                            placeholder="30min"
                                            className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                          />
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-3">
                                        <div>
                                          <label className="block text-sm font-medium text-white/70 mb-2">
                                            Default Duration (minutes)
                                          </label>
                                          <input
                                            type="number"
                                            value={functionConfig.parameters?.properties?.duration_minutes?.default || 30}
                                            onChange={(e) => setFunctionConfig(prev => prev ? { 
                                              ...prev, 
                                              parameters: {
                                                ...prev.parameters,
                                                properties: {
                                                  ...prev.parameters.properties,
                                                  duration_minutes: {
                                                    ...prev.parameters.properties.duration_minutes,
                                                    default: parseInt(e.target.value) || 30
                                                  }
                                                }
                                              }
                                            } : null)}
                                            className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-sm font-medium text-white/70 mb-2">
                                            Default Location Type
                                          </label>
                                          <select
                                            value={functionConfig.parameters?.properties?.location_type?.default || 'zoom'}
                                            onChange={(e) => setFunctionConfig(prev => prev ? { 
                                              ...prev, 
                                              parameters: {
                                                ...prev.parameters,
                                                properties: {
                                                  ...prev.parameters.properties,
                                                  location_type: {
                                                    ...prev.parameters.properties.location_type,
                                                    default: e.target.value
                                                  }
                                                }
                                              }
                                            } : null)}
                                            className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                          >
                                            <option value="zoom">Zoom</option>
                                            <option value="meet">Google Meet</option>
                                            <option value="teams">Microsoft Teams</option>
                                            <option value="phone">Phone Call</option>
                                            <option value="address">In Person</option>
                                          </select>
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              ) : null}

                              {/* Google Sheets Configuration */}
                              {functionConfig.name === 'update_spreadsheet' && (
                                <div className="space-y-4">
                                  <div>
                                    <label className="block text-sm font-medium text-white/70 mb-2">
                                      Google Sheets Access Token
                                    </label>
                                    <input
                                      type="password"
                                      value={functionConfig.headers?.Authorization?.replace('Bearer ', '') || ''}
                                      onChange={(e) => setFunctionConfig(prev => prev ? {
                                        ...prev,
                                        headers: {
                                          ...prev.headers,
                                          Authorization: `Bearer ${e.target.value}`
                                        }
                                      } : null)}
                                      placeholder="Enter your Google Sheets access token"
                                      className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-white/70 mb-2">
                                      Spreadsheet ID
                                    </label>
                                    <input
                                      type="text"
                                      value={functionConfig.url?.match(/spreadsheets\/([a-zA-Z0-9-_]+)/)?.[1] || ''}
                                      onChange={(e) => {
                                        const currentUrl = functionConfig.url || '';
                                        const newUrl = currentUrl.replace(/spreadsheets\/[a-zA-Z0-9-_]+/, `spreadsheets/${e.target.value}`);
                                        setFunctionConfig(prev => prev ? { ...prev, url: newUrl } : null);
                                      }}
                                      placeholder="Enter your Google Sheets spreadsheet ID"
                                      className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-white/70 mb-2">
                                      Sheet Name
                                    </label>
                                    <input
                                      type="text"
                                      value={functionConfig.url?.match(/values\/([^:]+)/)?.[1] || ''}
                                      onChange={(e) => {
                                        const currentUrl = functionConfig.url || '';
                                        const newUrl = currentUrl.replace(/values\/[^:]+/, `values/${e.target.value}`);
                                        setFunctionConfig(prev => prev ? { ...prev, url: newUrl } : null);
                                      }}
                                      placeholder="Sheet1"
                                      className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                </div>
                              )}

                              {/* Make.com Configuration */}
                              {functionConfig.name === 'trigger_automation' && (
                                <div className="space-y-4">
                                  <div>
                                    <label className="block text-sm font-medium text-white/70 mb-2">
                                      Make.com Webhook URL
                                    </label>
                                    <input
                                      type="url"
                                      value={functionConfig.url || ''}
                                      onChange={(e) => setFunctionConfig(prev => prev ? { ...prev, url: e.target.value } : null)}
                                      placeholder="https://hook.make.com/your-webhook-url"
                                      className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                </div>
                              )}

                              {/* Voicemail Detection Configuration */}
                              {functionConfig.name === 'voicemail_detection' && (
                                <div className="space-y-4">
                                  <div>
                                    <label className="block text-sm font-medium text-white/70 mb-2">
                                      Voicemail Message
                                    </label>
                                    <textarea
                                      value={functionConfig.parameters?.properties?.voicemail_message?.default || ''}
                                      onChange={(e) => setFunctionConfig(prev => prev ? { 
                                        ...prev, 
                                        parameters: {
                                          ...prev.parameters,
                                          properties: {
                                            ...prev.parameters.properties,
                                            voicemail_message: {
                                              ...prev.parameters.properties.voicemail_message,
                                              default: e.target.value
                                            }
                                          }
                                        }
                                      } : null)}
                                      placeholder="Hello, I noticed this call went to voicemail. I'll leave a brief message and follow up later."
                                      className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      rows={3}
                                    />
                                    <p className="text-xs text-white/50 mt-1">
                                      This message will be spoken when the AI detects that the call has gone to voicemail.
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Complex View - Raw JSON configuration */}
                          {functionViewMode[index] === 'complex' && (
                            <div className="space-y-4">
                              {/* Function Name */}
                              <div>
                                <label className="block text-sm font-medium text-white/70 mb-2">
                                  Function Name
                                </label>
                                <input
                                  type="text"
                                  value={functionConfig.name}
                                  onChange={(e) => setFunctionConfig(prev => prev ? { ...prev, name: e.target.value } : null)}
                                  className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              
                              {/* Function Description */}
                              <div>
                                <label className="block text-sm font-medium text-white/70 mb-2">
                                  Description
                                </label>
                                <textarea
                                  value={functionConfig.description}
                                  onChange={(e) => setFunctionConfig(prev => prev ? { ...prev, description: e.target.value } : null)}
                                  className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  rows={2}
                                />
                              </div>
                              
                              {/* API URL (for integrations) */}
                              <div>
                                <label className="block text-sm font-medium text-white/70 mb-2">
                                  API URL
                                </label>
                                <input
                                  type="text"
                                  value={functionConfig.url || ''}
                                  onChange={(e) => setFunctionConfig(prev => prev ? { ...prev, url: e.target.value } : null)}
                                  placeholder="https://api.example.com/webhook"
                                  className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              
                              {/* Headers */}
                              <div>
                                <label className="block text-sm font-medium text-white/70 mb-2">
                                  Headers (JSON)
                                </label>
                                <textarea
                                  value={JSON.stringify(functionConfig.headers || {}, null, 2)}
                                  onChange={(e) => {
                                    try {
                                      const headers = JSON.parse(e.target.value);
                                      setFunctionConfig(prev => prev ? { ...prev, headers } : null);
                                    } catch {
                                      // Invalid JSON, don't update
                                    }
                                  }}
                                  placeholder='{\n  "Authorization": "Bearer your-token",\n  "Content-Type": "application/json"\n}'
                                  className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                  rows={4}
                                />
                              </div>
                              
                              {/* Request Body Template */}
                              <div>
                                <label className="block text-sm font-medium text-white/70 mb-2">
                                  Request Body Template (JSON)
                                </label>
                                <textarea
                                  value={JSON.stringify(functionConfig.body || {}, null, 2)}
                                  onChange={(e) => {
                                    try {
                                      const body = JSON.parse(e.target.value);
                                      setFunctionConfig(prev => prev ? { ...prev, body } : null);
                                    } catch {
                                      // Invalid JSON, don't update
                                    }
                                  }}
                                  placeholder='{\n  "data": "{{parameter_value}}",\n  "action": "create"\n}'
                                  className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                  rows={4}
                                />
                              </div>
                              
                              {/* Parameters Schema */}
                              <div>
                                <label className="block text-sm font-medium text-white/70 mb-2">
                                  Parameters Schema (JSON Schema)
                                </label>
                                <textarea
                                  value={JSON.stringify(functionConfig.parameters, null, 2)}
                                  onChange={(e) => {
                                    try {
                                      const parameters = JSON.parse(e.target.value);
                                      setFunctionConfig(prev => prev ? { ...prev, parameters } : null);
                                    } catch {
                                      // Invalid JSON, don't update
                                    }
                                  }}
                                  className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                  rows={8}
                                />
                              </div>
                            </div>
                          )}

                          {/* Configure Tab Action Buttons */}
                          <div className="flex items-center justify-end space-x-3 pt-6 mt-6 border-t border-white/20">
                            <button
                              onClick={() => {
                                setEditingFunction(null);
                                setFunctionConfig(null);
                                // Return to simple view when canceling
                                setFunctionViewMode(prev => ({
                                  ...prev,
                                  [index]: 'simple'
                                }));
                              }}
                              className="px-4 py-2 text-white/70 hover:text-white transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => {
                                if (functionConfig) {
                                  const updatedFunctions = (projectConfig.customFunctions || []).map((func: any, i: number) => 
                                    i === index ? {
                                      ...functionConfig,
                                      parameters: functionConfig.parameters
                                    } : func
                                  );
                                  setProjectConfig(prev => ({
                                    ...prev,
                                    customFunctions: updatedFunctions,
                                    functionsEnabled: updatedFunctions.length > 0
                                  }));
                                  // Save to database
                                  saveFunctionsToDatabase(updatedFunctions);
                                  setEditingFunction(null);
                                  setFunctionConfig(null);
                                  // Return to simple view after saving
                                  setFunctionViewMode(prev => ({
                                    ...prev,
                                    [index]: 'simple'
                                  }));
                                }
                              }}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                            >
                              Save Changes
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Test Tab Content */}
                      {testingFunction === index && (
                        <div>
                          <div className="space-y-4">
                            <p className="text-white/70 text-sm mb-4">
                              Set test values for the function parameters. These will be used to make a real API call.
                            </p>
                            
                            {functionConfig.parameters?.properties && Object.entries(functionConfig.parameters.properties).map(([key, param]: [string, any]) => {
                              // Skip fields that are already configured in the function
                              if (key === 'event_type_slug' || key === 'cal_username') {
                                return null;
                              }
                              
                              return (
                              <div key={key}>
                                <label className="block text-sm font-medium text-white/70 mb-2">
                                  {key} {functionConfig.parameters?.required?.includes(key) && <span className="text-red-400">*</span>}
                                  <span className="text-white/50 ml-2">({param.type})</span>
                                </label>
                                <div className="text-xs text-white/50 mb-2">{param.description}</div>
                                
                                {param.type === 'boolean' ? (
                                  <select
                                    value={testParams[key] !== undefined ? String(testParams[key]) : ''}
                                    onChange={(e) => setTestParams(prev => ({ ...prev, [key]: e.target.value === 'true' }))}
                                    className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                                  >
                                    <option value="">Select...</option>
                                    <option value="true">True</option>
                                    <option value="false">False</option>
                                  </select>
                                ) : param.type === 'array' || param.type === 'object' ? (
                                  <textarea
                                    value={testParams[key] ? JSON.stringify(testParams[key], null, 2) : ''}
                                    onChange={(e) => {
                                      try {
                                        const parsed = JSON.parse(e.target.value || (param.type === 'array' ? '[]' : '{}'));
                                        setTestParams(prev => ({ ...prev, [key]: parsed }));
                                      } catch {
                                        // For invalid JSON, store the raw string temporarily
                                        setTestParams(prev => ({ ...prev, [key]: e.target.value }));
                                      }
                                    }}
                                    placeholder={param.type === 'array' ? 
                                      (key.includes('email') || key.includes('guest') ? '[]' : '["item1", "item2"]') : 
                                      '{"key": "value"}'
                                    }
                                    className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-sm"
                                    rows={3}
                                  />
                                ) : param.type === 'integer' || param.type === 'number' ? (
                                  <input
                                    type="number"
                                    value={testParams[key] || ''}
                                    onChange={(e) => setTestParams(prev => ({ 
                                      ...prev, 
                                      [key]: param.type === 'integer' ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0 
                                    }))}
                                    className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={testParams[key] || ''}
                                    onChange={(e) => setTestParams(prev => ({ ...prev, [key]: e.target.value }))}
                                    className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                                  />
                                )}
                              </div>
                              );
                            })}
                          </div>

                          {/* Test Tab Action Buttons */}
                          <div className="flex items-center justify-end space-x-3 pt-6 mt-6 border-t border-white/20">
                            <button
                              onClick={() => {
                                setEditingFunction(null);
                                setTestingFunction(null);
                                setTestParams({});
                                setFunctionConfig(null);
                              }}
                              className="px-4 py-2 text-white/70 hover:text-white transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => testFunction(index)}
                              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center space-x-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span>Run Test</span>
                            </button>
                          </div>

                          {/* Test Results in Test Tab */}
                          {testResults[index] && (
                            <div className={`mt-4 p-4 rounded-lg border ${
                              testResults[index]?.success 
                                ? 'bg-green-900/20 border-green-500/30 text-green-100' 
                                : 'bg-red-900/20 border-red-500/30 text-red-100'
                            }`}>
                              <div className="flex items-start space-x-3">
                                <div className="flex-shrink-0">
                                  {testResults[index]?.success ? (
                                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                  ) : (
                                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                  )}
                                </div>
                                <div className="flex-1">
                                  <h4 className="font-medium mb-2">
                                    {testResults[index]?.success ? 'Test Successful' : 'Test Failed'}
                                  </h4>
                                  <p className="text-sm mb-3">{testResults[index]?.message}</p>
                                  
                                  {testResults[index]?.success && testResults[index]?.data && (
                                    <div className="space-y-3">
                                      <div>
                                        <h5 className="text-sm font-medium mb-1">API Response:</h5>
                                        <div className="bg-black/30 rounded p-3 text-xs font-mono">
                                          {testResults[index]?.data?.response && (
                                            <pre className="text-gray-300">{JSON.stringify(testResults[index]?.data?.response, null, 2)}</pre>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                  
                                  {!testResults[index]?.success && testResults[index]?.data && (
                                    <div className="space-y-3">
                                      <div>
                                        <h5 className="text-sm font-medium mb-1">Error Details:</h5>
                                        <div className="bg-black/30 rounded p-3 text-xs font-mono">
                                          {testResults[index]?.data?.response && (
                                            <pre className="text-gray-300">{JSON.stringify(testResults[index]?.data?.response, null, 2)}</pre>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={() => setTestResults(prev => ({ ...prev, [index]: null }))}
                                  className="flex-shrink-0 text-white/50 hover:text-white/70"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Webhook Configuration Section */}
        <div className="mt-12 pt-8 border-t border-white/20">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <svg className="w-6 h-6 mr-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <h3 className="text-xl font-semibold text-white">Webhooks</h3>
            </div>
            <div className="flex items-center">
              <span className="text-sm text-white/70 mr-3">Enable Webhooks</span>
              <button
                onClick={() => {
                  const newEnabled = !projectConfig.webhooksEnabled;
                  setProjectConfig(prev => ({ 
                    ...prev, 
                    webhooksEnabled: newEnabled,
                    // Clear webhook URL if disabling
                    webhookUrl: newEnabled ? prev.webhookUrl : null,
                    webhookEvents: newEnabled ? prev.webhookEvents : []
                  }));
                  // Save to database
                  saveFunctionsToDatabase(projectConfig.customFunctions || []);
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-black ${
                  projectConfig.webhooksEnabled ? 'bg-purple-600' : 'bg-white/20'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    projectConfig.webhooksEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {projectConfig.webhooksEnabled && (
            <div className="bg-white/5 rounded-lg border border-white/20 p-6">
              <div className="space-y-6">
                {/* Webhook URL */}
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    Webhook URL
                  </label>
                  <input
                    type="url"
                    value={projectConfig.webhookUrl || ''}
                    onChange={(e) => {
                      setProjectConfig(prev => ({ ...prev, webhookUrl: e.target.value }));
                      // Auto-save webhook URL changes
                      setTimeout(() => {
                        saveFunctionsToDatabase(projectConfig.customFunctions || []);
                      }, 500);
                    }}
                    placeholder="https://hook.make.com/your-webhook-url or https://your-n8n-instance.com/webhook/..."
                    className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-white/50 mt-1">
                    Enter your Make.com, n8n, or other webhook URL. This will receive HTTP POST requests when events occur.
                  </p>
                </div>

                {/* Event Selection */}
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-3">
                    Events to Send
                  </label>
                  <div className="space-y-2">
                    {[
                      { id: 'call_started', label: 'Call Started', description: 'When a call begins' },
                      { id: 'call_ended', label: 'Call Ended', description: 'When a call ends (includes transcript)' }
                    ].map((event) => (
                      <div key={event.id} className="flex items-center space-x-3 p-3 bg-white/5 rounded-lg">
                        <input
                          type="checkbox"
                          id={event.id}
                          checked={(projectConfig.webhookEvents || []).includes(event.id)}
                          onChange={(e) => {
                            const currentEvents = projectConfig.webhookEvents || [];
                            const newEvents = e.target.checked
                              ? [...currentEvents, event.id]
                              : currentEvents.filter(id => id !== event.id);
                            setProjectConfig(prev => ({ ...prev, webhookEvents: newEvents }));
                            // Auto-save event changes
                            setTimeout(() => {
                              saveFunctionsToDatabase(projectConfig.customFunctions || []);
                            }, 500);
                          }}
                          className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-white/20 rounded bg-white/5"
                        />
                        <div className="flex-1 min-w-0">
                          <label htmlFor={event.id} className="text-sm font-medium text-white cursor-pointer">
                            {event.label}
                          </label>
                          <p className="text-xs text-white/50 break-words">{event.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!projectConfig.webhooksEnabled && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h4 className="text-lg font-medium text-white mb-2">Webhooks Disabled</h4>
              <p className="text-white/70 mb-4">Enable webhooks to receive real-time notifications when events occur during voice calls.</p>
              <p className="text-white/50 text-sm">Perfect for integrating with Make.com, n8n, Zapier, or your own automation systems.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}