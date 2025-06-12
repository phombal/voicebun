import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/service';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

interface SetupLiveKitTrunkRequest {
  phoneNumberId: string;
  phoneNumber: string;
  projectId: string;
}

export async function POST(request: NextRequest) {
  let tempFilePath: string | null = null;
  
  try {
    const body: SetupLiveKitTrunkRequest = await request.json();
    console.log('🎯 Setting up LiveKit inbound trunk for:', body.phoneNumber);

    // Create inbound trunk configuration
    const inboundTrunkConfig = {
      trunk: {
        name: `Inbound trunk for ${body.phoneNumber}`,
        numbers: [body.phoneNumber]
      }
    };

    console.log('📋 Inbound trunk config:', JSON.stringify(inboundTrunkConfig, null, 2));

    // Method 1: Try to use LiveKit CLI if available
    try {
      console.log('🔧 Attempting to create inbound trunk via LiveKit CLI...');
      
      // Create temporary config file
      const tempFileName = `livekit-trunk-${Date.now()}.json`;
      tempFilePath = join(tmpdir(), tempFileName);
      const configJson = JSON.stringify(inboundTrunkConfig, null, 2);
      
      console.log('📝 Creating temporary config file:', tempFilePath);
      writeFileSync(tempFilePath, configJson);
      
      // Try to execute LiveKit CLI command with file
      const command = `lk sip inbound create "${tempFilePath}"`;
      console.log('📝 Executing command:', command);
      
      const { stdout, stderr } = await execAsync(command);
      
      // Clean up temp file
      if (tempFilePath) {
        unlinkSync(tempFilePath);
        tempFilePath = null;
      }
      
      if (stderr && !stderr.includes('Warning') && !stderr.includes('Using url, api-key, api-secret from environment')) {
        throw new Error(`CLI Error: ${stderr}`);
      }
      
      console.log('✅ LiveKit inbound trunk created successfully via CLI');
      console.log('📤 CLI Output:', stdout);
      
      // Extract trunk ID from CLI output
      const trunkIdMatch = stdout.match(/SIPTrunkID:\s*(\S+)/);
      const trunkId = trunkIdMatch ? trunkIdMatch[1] : null;
      console.log('🆔 Extracted trunk ID:', trunkId);
      
      // Step 2: Create dispatch rule for this phone number
      console.log('🎯 Creating dispatch rule for phone number...');
      
      let dispatchRuleCreated = false;
      let dispatchOutput = '';
      let dispatchTempFilePath = '';
      
      try {
        // Debug: Check if any project data exists in the table
        const allProjectData = await db.getAllProjectDataWithServiceRole();
        console.log('🔍 Total project data records found (main path):', allProjectData.length);
        
        // Get project configuration for metadata using service role to bypass RLS
        const projectData = await db.getProjectDataWithServiceRole(body.projectId);
        
        // Log the project data retrieved
        console.log('🔍 Project data retrieved (main path):', projectData ? JSON.stringify(projectData, null, 2) : 'null');
        
        // Create the same metadata that we use in the test page connection
        const roomMetadata = {
          projectId: body.projectId,
          agentConfig: {
            prompt: projectData?.system_prompt || 'You are a helpful voice assistant.'
          },
          modelConfigurations: {
            // LLM Configuration
            llm: {
              provider: projectData?.llm_provider || 'openai',
              model: projectData?.llm_model || 'gpt-4o-mini',
              temperature: projectData?.llm_temperature || 0.7,
              maxResponseLength: projectData?.llm_max_response_length || 300
            },
            // STT Configuration
            stt: {
              provider: projectData?.stt_provider || 'deepgram',
              language: projectData?.stt_language || 'en',
              quality: projectData?.stt_quality || 'enhanced',
              processingMode: projectData?.stt_processing_mode || 'streaming',
              noiseSuppression: projectData?.stt_noise_suppression ?? true,
              autoPunctuation: projectData?.stt_auto_punctuation ?? true
            },
            // TTS Configuration
            tts: {
              provider: projectData?.tts_provider || 'cartesia',
              voice: projectData?.tts_voice || 'neutral'
            },
            // Additional configurations
            firstMessageMode: projectData?.first_message_mode || 'wait',
            responseLatencyPriority: projectData?.response_latency_priority || 'balanced'
          },
          phoneNumber: body.phoneNumber,
          timestamp: new Date().toISOString()
        };

        // Log the metadata that will be set
        console.log('📋 Room metadata to be set (main path):', JSON.stringify(roomMetadata, null, 2));

        // Create dispatch rule configuration
        const dispatchRuleConfig = {
          name: `Dispatch rule for ${body.phoneNumber}`,
          trunk_ids: trunkId ? [trunkId] : [], // Associate with specific trunk
          metadata: JSON.stringify(roomMetadata),
          attributes: {
            "phone_number": body.phoneNumber,
            "project_id": body.projectId,
            "dispatch_type": "voice_agent"
          },
          rule: {
            dispatchRuleIndividual: {
              roomPrefix: "call-"
            }
          },
          roomConfig: {
            agents: [{
              agentName: "voice-agent",
              metadata: JSON.stringify(roomMetadata)
            }]
          }
        };

        // Create temporary dispatch rule config file
        dispatchTempFilePath = join(tmpdir(), `livekit-dispatch-${Date.now()}.json`);
        writeFileSync(dispatchTempFilePath, JSON.stringify(dispatchRuleConfig, null, 2));
        console.log('📝 Creating temporary dispatch config file:', dispatchTempFilePath);

        // Check if dispatch rule already exists for this phone number
        try {
          console.log('📋 Checking for existing dispatch rules...');
          const { stdout: existingRules } = await execAsync('lk sip dispatch list --json');
          const rules = JSON.parse(existingRules);
          
          // Find existing rule for this phone number
          const existingRule = rules.items?.find((rule: any) => 
            (rule.name && rule.name.includes(body.phoneNumber)) ||
            (rule.attributes && rule.attributes.phone_number === body.phoneNumber)
          );
          
          if (existingRule) {
            console.log(`📋 Dispatch rule already exists: ${existingRule.sip_dispatch_rule_id} (${existingRule.name})`);
            dispatchOutput = `Existing rule: ${existingRule.sip_dispatch_rule_id}`;
            dispatchRuleCreated = true;
            
            // Clean up temp file since we don't need to create a new rule
            unlinkSync(dispatchTempFilePath);
            console.log('🧹 Cleaned up temporary dispatch config file (rule already exists)');
          } else {
            // Create new dispatch rule via CLI
            console.log('📝 Executing dispatch rule command: lk sip dispatch create', dispatchTempFilePath);
            const { stdout: dispatchStdout, stderr: dispatchStderr } = await execAsync(`lk sip dispatch create "${dispatchTempFilePath}"`);
            
            console.log('✅ LiveKit dispatch rule created successfully via CLI');
            console.log('📤 Dispatch CLI Output:', dispatchStdout);
            dispatchOutput = dispatchStdout;
            dispatchRuleCreated = true;
            
            // Extract dispatch rule ID from output
            const dispatchRuleIdMatch = dispatchStdout.match(/SIPDispatchRuleID:\s*(\w+)/);
            const dispatchRuleId = dispatchRuleIdMatch ? dispatchRuleIdMatch[1] : null;
            console.log('🆔 Extracted dispatch rule ID:', dispatchRuleId);
            
            // Update phone number with dispatch rule ID
            if (dispatchRuleId) {
              try {
                await db.updatePhoneNumberDispatchRuleWithServiceRole(body.phoneNumberId, dispatchRuleId);
                console.log('✅ Updated phone number with dispatch rule ID');
              } catch (updateError) {
                console.error('⚠️ Failed to update phone number with dispatch rule ID:', updateError);
              }
            }
            
            // Clean up dispatch temp file
            unlinkSync(dispatchTempFilePath);
            console.log('🧹 Cleaned up temporary dispatch config file');
          }
        } catch (listError) {
          console.log('⚠️ Could not check existing dispatch rules, proceeding with creation...');
          
          // Create dispatch rule via CLI
          console.log('📝 Executing dispatch rule command: lk sip dispatch create', dispatchTempFilePath);
          const { stdout: dispatchStdout, stderr: dispatchStderr } = await execAsync(`lk sip dispatch create "${dispatchTempFilePath}"`);
          
          console.log('✅ LiveKit dispatch rule created successfully via CLI');
          console.log('📤 Dispatch CLI Output:', dispatchStdout);
          dispatchOutput = dispatchStdout;
          dispatchRuleCreated = true;
          
          // Extract dispatch rule ID from output
          const dispatchRuleIdMatch = dispatchStdout.match(/SIPDispatchRuleID:\s*(\w+)/);
          const dispatchRuleId = dispatchRuleIdMatch ? dispatchRuleIdMatch[1] : null;
          console.log('🆔 Extracted dispatch rule ID (main path fallback):', dispatchRuleId);
          
          // Update phone number with dispatch rule ID
          if (dispatchRuleId) {
            try {
              await db.updatePhoneNumberDispatchRuleWithServiceRole(body.phoneNumberId, dispatchRuleId);
              console.log('✅ Updated phone number with dispatch rule ID (main path fallback)');
            } catch (updateError) {
              console.error('⚠️ Failed to update phone number with dispatch rule ID (main path fallback):', updateError);
            }
          }
          
          // Clean up dispatch temp file
          unlinkSync(dispatchTempFilePath);
          console.log('🧹 Cleaned up temporary dispatch config file');
        }
        
      } catch (dispatchError: any) {
        console.error('⚠️ Failed to create dispatch rule (non-critical):', dispatchError);
        dispatchOutput = `Error: ${dispatchError.message}`;
        // Clean up dispatch temp file even on error
        try {
          unlinkSync(dispatchTempFilePath);
          console.log('🧹 Cleaned up temporary dispatch config file (after error)');
        } catch (cleanupError) {
          console.error('Failed to cleanup dispatch temp file:', cleanupError);
        }
      }
      
      return NextResponse.json({
        success: true,
        method: 'cli',
        message: dispatchRuleCreated 
          ? 'LiveKit inbound trunk and dispatch rule created successfully via CLI'
          : 'LiveKit inbound trunk created successfully via CLI (dispatch rule failed)',
        data: {
          phoneNumber: body.phoneNumber,
          trunkConfig: inboundTrunkConfig,
          cliOutput: stdout,
          dispatchRule: {
            created: dispatchRuleCreated,
            output: dispatchOutput
          }
        }
      });
      
    } catch (cliError: any) {
      console.log('⚠️ CLI method failed:', cliError);
      
      // Clean up temp file if it exists
      if (tempFilePath) {
        try {
          unlinkSync(tempFilePath);
        } catch (e) {
          console.log('Failed to clean up temp file:', e);
        }
        tempFilePath = null;
      }
      
      // Check if it's a conflict error (trunk already exists)
      if (cliError.message && cliError.message.includes('Conflicting inbound SIP Trunks')) {
        console.log('📋 Trunk already exists for this phone number');
        
        // Try to list existing trunks to get the trunk ID
        try {
          const { stdout: listOutput } = await execAsync('lk sip inbound list --json');
          console.log('📋 Existing trunks:', listOutput);
          
          const trunks = JSON.parse(listOutput);
          const existingTrunk = trunks.items?.find((trunk: any) => 
            trunk.numbers && trunk.numbers.includes(body.phoneNumber)
          );
          
          if (existingTrunk) {
            console.log(`🎯 Found existing trunk: ${existingTrunk.sip_trunk_id} for ${body.phoneNumber}`);
            
            // Now create dispatch rule with the existing trunk ID
            console.log('🎯 Creating dispatch rule for existing trunk...');
            
            let dispatchRuleCreated = false;
            let dispatchOutput = '';
            let dispatchTempFilePath = '';
            
            try {
              // First check if the project exists at all
              const project = await db.getProjectWithServiceRole(body.projectId);
              console.log('🔍 Project exists:', project ? 'Yes' : 'No');
              
              // Debug: Check if any project data exists in the table
              const allProjectData = await db.getAllProjectDataWithServiceRole();
              console.log('🔍 Total project data records found:', allProjectData.length);
              
              // Get project configuration for metadata using service role to bypass RLS
              const projectData = await db.getProjectDataWithServiceRole(body.projectId);
              
              // Log the project data retrieved
              console.log('🔍 Project data retrieved:', projectData ? JSON.stringify(projectData, null, 2) : 'null');
              
              // Create the same metadata that we use in the test page connection
              const roomMetadata = {
                projectId: body.projectId,
                agentConfig: {
                  prompt: projectData?.system_prompt || 'You are a helpful voice assistant.'
                },
                modelConfigurations: {
                  // LLM Configuration
                  llm: {
                    provider: projectData?.llm_provider || 'openai',
                    model: projectData?.llm_model || 'gpt-4o-mini',
                    temperature: projectData?.llm_temperature || 0.7,
                    maxResponseLength: projectData?.llm_max_response_length || 300
                  },
                  // STT Configuration
                  stt: {
                    provider: projectData?.stt_provider || 'deepgram',
                    language: projectData?.stt_language || 'en',
                    quality: projectData?.stt_quality || 'enhanced',
                    processingMode: projectData?.stt_processing_mode || 'streaming',
                    noiseSuppression: projectData?.stt_noise_suppression ?? true,
                    autoPunctuation: projectData?.stt_auto_punctuation ?? true
                  },
                  // TTS Configuration
                  tts: {
                    provider: projectData?.tts_provider || 'cartesia',
                    voice: projectData?.tts_voice || 'neutral'
                  },
                  // Additional configurations
                  firstMessageMode: projectData?.first_message_mode || 'wait',
                  responseLatencyPriority: projectData?.response_latency_priority || 'balanced'
                },
                phoneNumber: body.phoneNumber,
                timestamp: new Date().toISOString()
              };

              // Log the metadata that will be set
              console.log('📋 Room metadata to be set:', JSON.stringify(roomMetadata, null, 2));

              // Create dispatch rule configuration with existing trunk ID
              const dispatchRuleConfig = {
                name: `Dispatch rule for ${body.phoneNumber}`,
                trunk_ids: [existingTrunk.sip_trunk_id], // Associate with existing trunk
                metadata: JSON.stringify(roomMetadata),
                attributes: {
                  "phone_number": body.phoneNumber,
                  "project_id": body.projectId,
                  "dispatch_type": "voice_agent"
                },
                rule: {
                  dispatchRuleIndividual: {
                    roomPrefix: "call-"
                  }
                },
                roomConfig: {
                  agents: [{
                    agentName: "voice-agent",
                    metadata: JSON.stringify(roomMetadata)
                  }]
                }
              };

              // Create temporary dispatch rule config file
              dispatchTempFilePath = join(tmpdir(), `livekit-dispatch-${Date.now()}.json`);
              writeFileSync(dispatchTempFilePath, JSON.stringify(dispatchRuleConfig, null, 2));
              console.log('📝 Creating temporary dispatch config file:', dispatchTempFilePath);

              // Check if dispatch rule already exists for this phone number
              try {
                console.log('📋 Checking for existing dispatch rules...');
                const { stdout: existingRules } = await execAsync('lk sip dispatch list --json');
                const rules = JSON.parse(existingRules);
                
                // Find existing rule for this phone number
                const existingRule = rules.items?.find((rule: any) => 
                  (rule.name && rule.name.includes(body.phoneNumber)) ||
                  (rule.attributes && rule.attributes.phone_number === body.phoneNumber)
                );
                
                if (existingRule) {
                  console.log(`📋 Dispatch rule already exists: ${existingRule.sip_dispatch_rule_id} (${existingRule.name})`);
                  dispatchOutput = `Existing rule: ${existingRule.sip_dispatch_rule_id}`;
                  dispatchRuleCreated = true;
                  
                  // Clean up temp file since we don't need to create a new rule
                  unlinkSync(dispatchTempFilePath);
                  console.log('🧹 Cleaned up temporary dispatch config file (rule already exists)');
                } else {
                  // Create new dispatch rule via CLI
                  console.log('📝 Executing dispatch rule command: lk sip dispatch create', dispatchTempFilePath);
                  const { stdout: dispatchStdout } = await execAsync(`lk sip dispatch create "${dispatchTempFilePath}"`);
                  
                  console.log('✅ LiveKit dispatch rule created successfully via CLI');
                  console.log('📤 Dispatch CLI Output:', dispatchStdout);
                  dispatchOutput = dispatchStdout;
                  dispatchRuleCreated = true;
                  
                  // Clean up dispatch temp file
                  unlinkSync(dispatchTempFilePath);
                  console.log('🧹 Cleaned up temporary dispatch config file');
                }
              } catch (listError) {
                console.log('⚠️ Could not check existing dispatch rules, proceeding with creation...');
                
                // Create dispatch rule via CLI
                console.log('📝 Executing dispatch rule command: lk sip dispatch create', dispatchTempFilePath);
                const { stdout: dispatchStdout } = await execAsync(`lk sip dispatch create "${dispatchTempFilePath}"`);
                
                console.log('✅ LiveKit dispatch rule created successfully via CLI');
                console.log('📤 Dispatch CLI Output:', dispatchStdout);
                dispatchOutput = dispatchStdout;
                dispatchRuleCreated = true;
                
                // Clean up dispatch temp file
                unlinkSync(dispatchTempFilePath);
                console.log('🧹 Cleaned up temporary dispatch config file');
              }
              
            } catch (dispatchError: any) {
              console.error('⚠️ Failed to create dispatch rule (non-critical):', dispatchError);
              dispatchOutput = `Error: ${dispatchError.message}`;
              // Clean up dispatch temp file even on error
              try {
                if (dispatchTempFilePath) {
                  unlinkSync(dispatchTempFilePath);
                  console.log('🧹 Cleaned up temporary dispatch config file (after error)');
                }
              } catch (cleanupError) {
                console.error('Failed to cleanup dispatch temp file:', cleanupError);
              }
            }
            
            return NextResponse.json({
              success: true,
              method: 'existing',
              message: dispatchRuleCreated 
                ? 'LiveKit inbound trunk already exists, dispatch rule created/verified successfully'
                : 'LiveKit inbound trunk already exists (dispatch rule failed)',
              data: {
                phoneNumber: body.phoneNumber,
                existingTrunk: existingTrunk,
                dispatchRule: {
                  created: dispatchRuleCreated,
                  output: dispatchOutput
                }
              }
            });
          }
          
          return NextResponse.json({
            success: true,
            method: 'existing',
            message: 'LiveKit inbound trunk already exists for this phone number',
            data: {
              phoneNumber: body.phoneNumber,
              existingTrunks: listOutput
            }
          });
        } catch (listError) {
          console.log('Failed to list existing trunks:', listError);
        }
      }
      
      // Method 2: Provide manual instructions
      const manualInstructions = {
        step1: 'Create a file named inbound-trunk.json with the following content:',
        configFile: inboundTrunkConfig,
        step2: 'Run the following LiveKit CLI command:',
        command: 'lk sip inbound create inbound-trunk.json',
        alternativeCommand: `echo '${JSON.stringify(inboundTrunkConfig)}' > /tmp/trunk.json && lk sip inbound create /tmp/trunk.json`,
        note: 'Make sure you have the LiveKit CLI installed and configured with your project credentials',
        troubleshooting: {
          conflictError: 'If you get a "Conflicting inbound SIP Trunks" error, a trunk already exists for this number',
          listCommand: 'lk sip inbound list',
          deleteCommand: 'lk sip inbound delete <TRUNK_ID>'
        }
      };
      
      return NextResponse.json({
        success: true,
        method: 'manual',
        message: 'LiveKit CLI error occurred. Please set up the inbound trunk manually.',
        data: {
          phoneNumber: body.phoneNumber,
          instructions: manualInstructions,
          error: cliError.message
        }
      });
    }

  } catch (error: any) {
    console.error('❌ LiveKit trunk setup error:', error);
    
    // Clean up temp file if it exists
    if (tempFilePath) {
      try {
        unlinkSync(tempFilePath);
      } catch (e) {
        console.log('Failed to clean up temp file:', e);
      }
    }
    
    return NextResponse.json({
      success: false,
      error: 'LiveKit Trunk Setup Failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
} 