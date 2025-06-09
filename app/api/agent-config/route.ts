import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/database/auth';
import { Database, AgentConfiguration, VoiceAgentConfig } from '@/lib/database/types';

// Function to extract agent configuration from code and user config
function extractAgentConfiguration(
  code: string, 
  config: VoiceAgentConfig, 
  projectId: string, 
  userId: string
): Omit<AgentConfiguration, 'id' | 'created_at' | 'updated_at'> {
  console.log('🔍 Starting advanced code parsing...');
  console.log('🔍 Code preview:', code.substring(0, 200) + '...');

  // Extract dependencies from import statements
  const dependencies: string[] = [];
  const lines = code.split('\n');
  
  lines.forEach(line => {
    if (line.trim().startsWith('from ') || line.trim().startsWith('import ')) {
      const match = line.match(/from\s+([^\s]+)|import\s+([^\s,\(\)]+)/);
      if (match) {
        const pkg = match[1] || match[2];
        if (pkg && !pkg.startsWith('.') && !['os', 'sys', 'json', 'asyncio', 'logging'].includes(pkg)) {
          if (!dependencies.includes(pkg)) {
            dependencies.push(pkg);
          }
        }
      }
    }
  });

  // Extract required environment variables
  const requiredEnvVars: string[] = [];
  const envMatches = code.match(/os\.getenv\(['"]([^'"]+)['"]\)/g);
  if (envMatches) {
    envMatches.forEach(match => {
      const envVar = match.match(/os\.getenv\(['"]([^'"]+)['"]\)/)?.[1];
      if (envVar && !requiredEnvVars.includes(envVar)) {
        requiredEnvVars.push(envVar);
      }
    });
  }

  // Advanced parsing for STT configuration
  let sttProvider = 'deepgram';
  let sttModel = 'nova-2';
  let sttConfig: any = {};

  // Look for STT initialization patterns
  const sttMatches = code.match(/(\w+)\.STT\s*\([^)]*\)/g);
  if (sttMatches && sttMatches.length > 0) {
    const sttMatch = sttMatches[0];
    
    // Extract provider from the match (e.g., "deepgram.STT" -> "deepgram")
    const providerMatch = sttMatch.match(/(\w+)\.STT/);
    if (providerMatch) {
      sttProvider = providerMatch[1];
    }
    
    // Extract model parameter
    const modelMatch = sttMatch.match(/model\s*=\s*['"]([^'"]+)['"]/);
    if (modelMatch) {
      sttModel = modelMatch[1];
    }
    
    // Extract language parameter
    const languageMatch = sttMatch.match(/language\s*=\s*['"]([^'"]+)['"]/);
    if (languageMatch) {
      sttConfig.language = languageMatch[1];
    }
    
    console.log('🔍 Parsed STT:', { provider: sttProvider, model: sttModel, config: sttConfig });
  }

  // Advanced parsing for TTS configuration
  let ttsProvider = 'cartesia';
  let ttsModel = 'sonic-english';
  let ttsConfig: any = {};

  const ttsMatches = code.match(/(\w+)\.TTS\s*\([^)]*\)/g);
  if (ttsMatches && ttsMatches.length > 0) {
    const ttsMatch = ttsMatches[0];
    
    // Extract provider
    const providerMatch = ttsMatch.match(/(\w+)\.TTS/);
    if (providerMatch) {
      ttsProvider = providerMatch[1];
    }
    
    // Extract model parameter
    const modelMatch = ttsMatch.match(/model\s*=\s*['"]([^'"]+)['"]/);
    if (modelMatch) {
      ttsModel = modelMatch[1];
    }
    
    // Extract voice parameter (important for voice IDs)
    const voiceMatch = ttsMatch.match(/voice\s*=\s*['"]([^'"]+)['"]/);
    if (voiceMatch) {
      ttsConfig.voice = voiceMatch[1];
    }
    
    // Extract voice_id parameter (Cartesia specific)
    const voiceIdMatch = ttsMatch.match(/voice_id\s*=\s*['"]([^'"]+)['"]/);
    if (voiceIdMatch) {
      ttsConfig.voice_id = voiceIdMatch[1];
    }
    
    // Extract speed parameter
    const speedMatch = ttsMatch.match(/speed\s*=\s*([\d.]+)/);
    if (speedMatch) {
      ttsConfig.speed = parseFloat(speedMatch[1]);
    }
    
    console.log('🔍 Parsed TTS:', { provider: ttsProvider, model: ttsModel, config: ttsConfig });
  }

  // Advanced parsing for LLM configuration
  let llmProvider = 'openai';
  let llmModel = 'gpt-4o-mini';
  let llmConfig: any = {};

  const llmMatches = code.match(/(\w+)\.LLM\s*\([^)]*\)/g);
  if (llmMatches && llmMatches.length > 0) {
    const llmMatch = llmMatches[0];
    
    // Extract provider
    const providerMatch = llmMatch.match(/(\w+)\.LLM/);
    if (providerMatch) {
      llmProvider = providerMatch[1];
    }
    
    // Extract model parameter
    const modelMatch = llmMatch.match(/model\s*=\s*['"]([^'"]+)['"]/);
    if (modelMatch) {
      llmModel = modelMatch[1];
    }
    
    // Extract temperature parameter
    const tempMatch = llmMatch.match(/temperature\s*=\s*([\d.]+)/);
    if (tempMatch) {
      llmConfig.temperature = parseFloat(tempMatch[1]);
    }
    
    console.log('🔍 Parsed LLM:', { provider: llmProvider, model: llmModel, config: llmConfig });
  }

  // Advanced parsing for VAD configuration
  let vadProvider = 'silero';
  let vadConfig: any = {};

  const vadMatches = code.match(/(\w+)\.VAD\s*\([^)]*\)/g);
  if (vadMatches && vadMatches.length > 0) {
    const vadMatch = vadMatches[0];
    
    // Extract provider
    const providerMatch = vadMatch.match(/(\w+)\.VAD/);
    if (providerMatch) {
      vadProvider = providerMatch[1];
    }
    
    console.log('🔍 Parsed VAD:', { provider: vadProvider, config: vadConfig });
  }

  // Parse turn detection configuration
  let turnDetectionConfig: any = {};
  const turnDetectionMatches = code.match(/turn_detection\s*=\s*([^,\n)]+)/);
  if (turnDetectionMatches) {
    const turnDetectionMatch = turnDetectionMatches[1].trim();
    if (turnDetectionMatch.includes('MultilingualModel')) {
      turnDetectionConfig = { type: 'multilingual' };
    }
    console.log('🔍 Parsed Turn Detection:', turnDetectionConfig);
  }

  // Parse noise cancellation configuration
  let roomInputOptions: any = {};
  const noiseCancellationMatch = code.match(/noise_cancellation\s*=\s*([^,\n)]+)/);
  if (noiseCancellationMatch) {
    const ncType = noiseCancellationMatch[1].trim();
    if (ncType.includes('BVC')) {
      roomInputOptions.noise_cancellation = 'bvc';
    }
    console.log('🔍 Parsed Noise Cancellation:', roomInputOptions);
  }

  // Parse assistant instructions with comprehensive pattern matching
  let agentInstructions = config.prompt; // Default fallback
  console.log('🔍 Starting agent instructions parsing...');
  
  // Pattern 1: Agent class constructor - super().__init__(instructions="...")
  const superInitPattern = /super\(\)\.__init__\(\s*instructions\s*=\s*["']([^"']+)["']\s*\)/;
  const superInitMatch = code.match(superInitPattern);
  if (superInitMatch) {
    agentInstructions = superInitMatch[1];
    console.log('🔍 Found instructions in Agent constructor:', agentInstructions.substring(0, 100) + '...');
  }
  
  // Pattern 2: Direct instructions parameter in various contexts
  const directInstructionsPattern = /instructions\s*=\s*["']([^"']+)["']/g;
  let directMatch;
  const directMatches = [];
  while ((directMatch = directInstructionsPattern.exec(code)) !== null) {
    directMatches.push(directMatch);
  }
  if (directMatches.length > 0) {
    // Use the first (usually main) instructions found
    agentInstructions = directMatches[0][1];
    console.log('🔍 Found direct instructions:', agentInstructions.substring(0, 100) + '...');
  }
  
  // Pattern 3: Multi-line instructions with triple quotes (using [\s\S] instead of . with s flag)
  const multilinePattern = /instructions\s*=\s*["']{3}([\s\S]*?)["']{3}/;
  const multilineMatch = code.match(multilinePattern);
  if (multilineMatch) {
    agentInstructions = multilineMatch[1].trim();
    console.log('🔍 Found multi-line instructions:', agentInstructions.substring(0, 100) + '...');
  }
  
  // Pattern 4: Instructions in Agent class docstring or comments
  const agentClassPattern = /class\s+Assistant\s*\([^)]*\):\s*([\s\S]*?)def\s+__init__/;
  const agentClassMatch = code.match(agentClassPattern);
  if (agentClassMatch) {
    const classContent = agentClassMatch[1];
    const docstringPattern = /["']{3}([\s\S]*?)["']{3}/;
    const docstringMatch = classContent.match(docstringPattern);
    if (docstringMatch && !agentInstructions) {
      agentInstructions = docstringMatch[1].trim();
      console.log('🔍 Found instructions in Agent class docstring:', agentInstructions.substring(0, 100) + '...');
    }
  }
  
  // Pattern 5: Instructions in generate_reply calls (initial greeting)
  const generateReplyPattern = /generate_reply\s*\(\s*instructions\s*=\s*["']([^"']+)["']\s*\)/;
  const generateReplyMatch = code.match(generateReplyPattern);
  let initialGreeting = '';
  if (generateReplyMatch) {
    initialGreeting = generateReplyMatch[1];
    console.log('🔍 Found initial greeting in generate_reply:', initialGreeting.substring(0, 100) + '...');
    
    // If we don't have main instructions yet, use this as fallback
    if (agentInstructions === config.prompt) {
      agentInstructions = initialGreeting;
    }
  }
  
  // Pattern 6: Instructions in f-strings or concatenated strings (more complex)
  const fStringPattern = /instructions\s*=\s*f["']([^"']+)["']/g;
  let fStringMatch;
  const fStringMatches = [];
  while ((fStringMatch = fStringPattern.exec(code)) !== null) {
    fStringMatches.push(fStringMatch);
  }
  if (fStringMatches.length > 0 && agentInstructions === config.prompt) {
    agentInstructions = fStringMatches[0][1];
    console.log('🔍 Found f-string instructions:', agentInstructions.substring(0, 100) + '...');
  }
  
  // Clean up the instructions (remove excessive whitespace, escape characters)
  if (agentInstructions) {
    agentInstructions = agentInstructions
      .replace(/\\n/g, '\n')  // Convert literal \n to actual newlines
      .replace(/\\t/g, '\t')  // Convert literal \t to actual tabs
      .replace(/\s+/g, ' ')   // Normalize whitespace
      .trim();
  }
  
  console.log('🔍 Final agent instructions:', {
    source: agentInstructions === config.prompt ? 'fallback' : 'parsed',
    length: agentInstructions.length,
    preview: agentInstructions.substring(0, 150) + (agentInstructions.length > 150 ? '...' : '')
  });

  const finalConfig = {
    project_id: projectId,
    user_id: userId,
    config_name: `Agent Config - ${new Date().toISOString().replace(/[:.]/g, '-')}`,
    description: config.prompt.substring(0, 200) + (config.prompt.length > 200 ? '...' : ''),
    stt_provider: sttProvider,
    stt_model: sttModel,
    stt_config: { language: config.language || 'en', ...sttConfig },
    tts_provider: ttsProvider,
    tts_model: ttsModel,
    tts_config: { voice: 'default', ...ttsConfig },
    llm_provider: llmProvider,
    llm_model: llmModel,
    llm_config: { temperature: 0.7, ...llmConfig },
    vad_provider: vadProvider,
    vad_config: vadConfig,
    turn_detection_config: turnDetectionConfig,
    function_calls: [],
    tool_integrations: [],
    agent_instructions: agentInstructions,
    agent_personality: {
      personality: config.personality,
      responseStyle: config.responseStyle,
      capabilities: config.capabilities
    },
    required_env_vars: requiredEnvVars,
    dependencies: dependencies,
    source_files: { 'voice_agent.py': code },
    is_active: true,
    version: 1
  };

  console.log('🔍 Final parsed configuration:', {
    stt: `${sttProvider}/${sttModel}`,
    tts: `${ttsProvider}/${ttsModel}`,
    llm: `${llmProvider}/${llmModel}`,
    vad: vadProvider,
    dependencies: dependencies.length,
    envVars: requiredEnvVars.length
  });

  return finalConfig;
}

export async function POST(request: NextRequest) {
  try {
    const { code, config, projectId, userId } = await request.json();

    console.log('🔍 DEBUG: Received agent config save request:', {
      hasCode: !!code,
      codeLength: code?.length || 0,
      hasConfig: !!config,
      projectId,
      userId,
      configKeys: config ? Object.keys(config) : []
    });

    if (!code || !config || !projectId || !userId) {
      console.error('❌ Missing required fields:', {
        hasCode: !!code,
        hasConfig: !!config,
        hasProjectId: !!projectId,
        hasUserId: !!userId
      });
      return NextResponse.json(
        { error: 'Missing required fields: code, config, projectId, userId' },
        { status: 400 }
      );
    }

    // Extract configuration from code and user config
    const agentConfig = extractAgentConfiguration(code, config, projectId, userId);
    
    console.log('🔍 DEBUG: Generated agent config:', {
      config_name: agentConfig.config_name,
      project_id: agentConfig.project_id,
      user_id: agentConfig.user_id,
      description: (agentConfig.description || '').substring(0, 100) + '...',
      has_source_files: !!agentConfig.source_files
    });

    // Save to database
    console.log('💾 Attempting to save to database...');
    const { data, error } = await supabase
      .from('agent_configurations')
      .insert(agentConfig)
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase error saving agent configuration:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return NextResponse.json(
        { error: 'Failed to save agent configuration', details: error.message },
        { status: 500 }
      );
    }

    console.log('✅ Successfully saved agent configuration:', {
      id: data.id,
      config_name: data.config_name,
      created_at: data.created_at
    });

    return NextResponse.json({ 
      success: true, 
      config: data,
      message: 'Agent configuration saved successfully'
    });

  } catch (error) {
    console.error('❌ Error in agent-config POST:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      error: error
    });
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const configId = searchParams.get('id');
    const projectId = searchParams.get('projectId');
    const userId = searchParams.get('userId');

    if (configId) {
      // Get specific configuration
      const { data, error } = await supabase
        .from('agent_configurations')
        .select('*')
        .eq('id', configId)
        .single();

      if (error) {
        return NextResponse.json(
          { error: 'Configuration not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ config: data });
    } else if (projectId) {
      // Get all configurations for a project
      const { data, error } = await supabase
        .from('agent_configurations')
        .select('*')
        .eq('project_id', projectId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching configurations:', error);
        return NextResponse.json(
          { error: 'Failed to fetch configurations' },
          { status: 500 }
        );
      }

      return NextResponse.json({ configs: data });
    } else if (userId) {
      // Get all configurations for a user
      const { data, error } = await supabase
        .from('agent_configurations')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching user configurations:', error);
        return NextResponse.json(
          { error: 'Failed to fetch configurations' },
          { status: 500 }
        );
      }

      return NextResponse.json({ configs: data });
    } else {
      return NextResponse.json(
        { error: 'Missing required parameter: id, projectId, or userId' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Error in agent-config GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 