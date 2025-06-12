import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/service';
import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync, unlinkSync } from 'fs';

const execAsync = promisify(exec);

interface UpdateDispatchRuleRequest {
  phoneNumberId: string;
  projectId: string;
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Starting dispatch rule metadata update...');
    
    const body: UpdateDispatchRuleRequest = await request.json();
    console.log('📝 Request body:', body);

    if (!body.phoneNumberId || !body.projectId) {
      return NextResponse.json(
        { error: 'Missing required fields: phoneNumberId and projectId' },
        { status: 400 }
      );
    }

    // Get phone number details to get the dispatch rule ID
    const phoneNumber = await db.getPhoneNumber(body.phoneNumberId);
    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Phone number not found' },
        { status: 404 }
      );
    }

    if (!phoneNumber.dispatch_rule_id) {
      return NextResponse.json(
        { error: 'No dispatch rule ID associated with this phone number' },
        { status: 400 }
      );
    }

    console.log('📞 Phone number details:', {
      phone: phoneNumber.phone_number,
      dispatchRuleId: phoneNumber.dispatch_rule_id
    });

    // Get the latest project configuration
    const projectData = await db.getProjectDataWithServiceRole(body.projectId);
    console.log('🔍 Project data retrieved:', projectData ? 'Found' : 'Not found');

    // Create updated metadata
    const updatedMetadata = {
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
      phoneNumber: phoneNumber.phone_number,
      timestamp: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };

    console.log('📋 Updated metadata to be set:', JSON.stringify(updatedMetadata, null, 2));

    // First, get the trunk ID for this phone number (needed for updates)
    console.log('🔍 Getting trunk ID for phone number before update:', phoneNumber.phone_number);
    let trunkId: string | null = null;
    
    try {
      const { stdout: listOutput } = await execAsync('lk sip inbound list --json');
      const jsonStart = listOutput.indexOf('{');
      if (jsonStart !== -1) {
        const jsonOutput = listOutput.substring(jsonStart);
        const trunks = JSON.parse(jsonOutput);
        const existingTrunk = trunks.items?.find((trunk: any) => 
          trunk.numbers && trunk.numbers.includes(phoneNumber.phone_number)
        );
        
        if (existingTrunk) {
          trunkId = existingTrunk.sip_trunk_id;
          console.log('🎯 Found trunk ID for update:', trunkId);
        }
      }
    } catch (trunkError: any) {
      console.log('⚠️ Could not get trunk ID for update:', trunkError.message);
    }

    // Create dispatch rule update configuration with trunk_ids
    const updateConfig = {
      name: `Dispatch rule for ${phoneNumber.phone_number}`,
      trunk_ids: trunkId ? [trunkId] : [], // Include trunk_ids in update
      metadata: JSON.stringify(updatedMetadata),
      attributes: {
        "phone_number": phoneNumber.phone_number,
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
          metadata: JSON.stringify(updatedMetadata)
        }]
      }
    };

    // Create temporary config file for the update
    const tempFilePath = join(tmpdir(), `livekit-dispatch-update-${Date.now()}.json`);
    writeFileSync(tempFilePath, JSON.stringify(updateConfig, null, 2));
    console.log('📝 Created temporary update config file:', tempFilePath);

    try {
      // First, try to update the existing dispatch rule
      console.log('🔄 Attempting to update existing dispatch rule via CLI...');
      const updateCommand = `lk sip dispatch update --id ${phoneNumber.dispatch_rule_id} "${tempFilePath}"`;
      console.log('📝 Executing update command:', updateCommand);
      
      try {
        const { stdout, stderr } = await execAsync(updateCommand);
        
        console.log('✅ Dispatch rule updated successfully');
        console.log('📤 CLI Output:', stdout);
        if (stderr) {
          console.log('⚠️ CLI Stderr:', stderr);
        }

        // Clean up temp file
        unlinkSync(tempFilePath);
        console.log('🧹 Cleaned up temporary config file');

        return NextResponse.json({
          success: true,
          message: 'Dispatch rule metadata updated successfully',
          data: {
            dispatchRuleId: phoneNumber.dispatch_rule_id,
            phoneNumber: phoneNumber.phone_number,
            updatedMetadata: updatedMetadata,
            cliOutput: stdout
          }
        });

      } catch (updateError: any) {
        console.log('⚠️ Update failed, checking if rule exists:', updateError.message);
        
        // Check if the error is due to missing rule
        if (updateError.message.includes('missing rule') || updateError.message.includes('not found')) {
          console.log('🔄 Dispatch rule not found, attempting to recreate...');
          
          // We already have the trunk ID from earlier, but if not found, try again
          if (!trunkId) {
            console.log('🔍 Trunk ID not found earlier, retrying for dispatch rule creation...');
            try {
              const { stdout: listOutput } = await execAsync('lk sip inbound list --json');
              const jsonStart = listOutput.indexOf('{');
              if (jsonStart !== -1) {
                const jsonOutput = listOutput.substring(jsonStart);
                const trunks = JSON.parse(jsonOutput);
                const existingTrunk = trunks.items?.find((trunk: any) => 
                  trunk.numbers && trunk.numbers.includes(phoneNumber.phone_number)
                );
                
                if (existingTrunk) {
                  trunkId = existingTrunk.sip_trunk_id;
                  console.log('🎯 Found trunk ID on retry:', trunkId);
                }
              }
            } catch (retryError: any) {
              console.log('⚠️ Retry to get trunk ID failed:', retryError.message);
            }
          } else {
            console.log('🎯 Using trunk ID from earlier lookup:', trunkId);
          }

          // Create the dispatch rule config with correct format (matching LiveKit docs)
          const createConfig = {
            name: `Dispatch rule for ${phoneNumber.phone_number}`,
            trunk_ids: trunkId ? [trunkId] : [], // Specify which trunk this rule applies to
            metadata: JSON.stringify(updatedMetadata),
            attributes: {
              "phone_number": phoneNumber.phone_number,
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
                metadata: JSON.stringify(updatedMetadata)
              }]
            }
          };

          // Create new config file for creation
          const createFilePath = join(tmpdir(), `livekit-dispatch-create-${Date.now()}.json`);
          writeFileSync(createFilePath, JSON.stringify(createConfig, null, 2));
          console.log('📝 Created temporary create config file:', createFilePath);

          try {
            const createCommand = `lk sip dispatch create "${createFilePath}"`;
            console.log('📝 Executing create command:', createCommand);
            
            const { stdout: createStdout, stderr: createStderr } = await execAsync(createCommand);
            console.log('✅ New dispatch rule created successfully');
            console.log('📤 Create CLI Output:', createStdout);
            
            // Extract the new dispatch rule ID from the output
            const dispatchRuleIdMatch = createStdout.match(/SIPDispatchRuleID:\s*(\w+)/);
            const newDispatchRuleId = dispatchRuleIdMatch ? dispatchRuleIdMatch[1] : null;
            
            if (newDispatchRuleId) {
              console.log('🆔 New dispatch rule ID:', newDispatchRuleId);
              
              // Update the phone number record with the new dispatch rule ID
              await db.updatePhoneNumberDispatchRuleWithServiceRole(body.phoneNumberId, newDispatchRuleId);
              console.log('✅ Updated phone number record with new dispatch rule ID');
            }

            // Clean up temp files
            unlinkSync(tempFilePath);
            unlinkSync(createFilePath);
            console.log('🧹 Cleaned up temporary config files');

            return NextResponse.json({
              success: true,
              message: 'Dispatch rule recreated and metadata updated successfully',
              data: {
                dispatchRuleId: newDispatchRuleId || phoneNumber.dispatch_rule_id,
                phoneNumber: phoneNumber.phone_number,
                updatedMetadata: updatedMetadata,
                cliOutput: createStdout,
                recreated: true
              }
            });

          } catch (createError: any) {
            console.error('❌ Failed to create new dispatch rule:', createError);
            
            // Check if this is a conflict error with an existing dispatch rule
            if (createError.message && createError.message.includes('Conflicting SIP Dispatch Rules')) {
              console.log('🔄 Detected conflicting dispatch rule during creation, attempting to find and update existing rule...');
              
              // Try to extract the conflicting dispatch rule ID from the error message
              const ruleIdMatch = createError.message.match(/SDR_\w+/);
              if (ruleIdMatch) {
                const conflictingRuleId = ruleIdMatch[0];
                console.log('🎯 Extracted conflicting rule ID from create error:', conflictingRuleId);
                
                try {
                  // Update the phone number record with the conflicting dispatch rule ID
                  await db.updatePhoneNumberDispatchRuleWithServiceRole(body.phoneNumberId, conflictingRuleId);
                  console.log('✅ Updated phone number record with conflicting dispatch rule ID');
                  
                  // Now try to update the existing rule with new metadata
                  const updateConflictCommand = `lk sip dispatch update --id ${conflictingRuleId} "${tempFilePath}"`;
                  console.log('📝 Executing update command for existing rule:', updateConflictCommand);
                  
                  const { stdout: updateConflictOutput } = await execAsync(updateConflictCommand);
                  console.log('✅ Successfully updated existing dispatch rule');
                  console.log('📤 Update Output:', updateConflictOutput);
                  
                  // Clean up temp files
                  unlinkSync(tempFilePath);
                  unlinkSync(createFilePath);
                  console.log('🧹 Cleaned up temporary config files');
                  
                  return NextResponse.json({
                    success: true,
                    message: 'Found existing dispatch rule and updated metadata successfully',
                    data: {
                      dispatchRuleId: conflictingRuleId,
                      phoneNumber: phoneNumber.phone_number,
                      updatedMetadata: updatedMetadata,
                      cliOutput: updateConflictOutput,
                      resolvedConflict: true
                    }
                  });
                } catch (conflictUpdateError: any) {
                  console.error('❌ Failed to update existing dispatch rule:', conflictUpdateError);
                  // The conflicting rule might also be missing, try to list existing rules
                  console.log('🔍 Attempting to list existing dispatch rules to find any active rules for this phone number...');
                }
              }
            }
            
            // Check if we should try to find any existing dispatch rules for this phone number
            console.log('🔍 Searching for any existing dispatch rules for this phone number...');
            try {
              const { stdout: listOutput } = await execAsync('lk sip dispatch list --json');
              const jsonStart = listOutput.indexOf('{');
              if (jsonStart !== -1) {
                const jsonOutput = listOutput.substring(jsonStart);
                const rules = JSON.parse(jsonOutput);
                console.log('📋 Found dispatch rules:', rules.items?.length || 0);
                
                // Look for any rule that might be associated with this phone number
                const matchingRule = rules.items?.find((rule: any) => {
                  const ruleName = rule.name || '';
                  const ruleAttrs = rule.attributes || {};
                  return ruleName.includes(phoneNumber.phone_number) || 
                         ruleAttrs.phone_number === phoneNumber.phone_number ||
                         (rule.trunk_ids && rule.trunk_ids.includes(trunkId));
                });
                
                if (matchingRule) {
                  const existingRuleId = matchingRule.sip_dispatch_rule_id;
                  console.log('🎯 Found existing rule for this phone number:', existingRuleId);
                  
                  try {
                    // Update database with the found rule ID
                    await db.updatePhoneNumberDispatchRuleWithServiceRole(body.phoneNumberId, existingRuleId);
                    console.log('✅ Updated database with found dispatch rule ID');
                    
                    // Try to update the existing rule
                    const updateExistingCommand = `lk sip dispatch update --id ${existingRuleId} "${tempFilePath}"`;
                    const { stdout: updateExistingOutput } = await execAsync(updateExistingCommand);
                    console.log('✅ Successfully updated found dispatch rule');
                    
                    // Clean up temp files
                    unlinkSync(tempFilePath);
                    unlinkSync(createFilePath);
                    console.log('🧹 Cleaned up temporary config files');
                    
                    return NextResponse.json({
                      success: true,
                      message: 'Found and updated existing dispatch rule successfully',
                      data: {
                        dispatchRuleId: existingRuleId,
                        phoneNumber: phoneNumber.phone_number,
                        updatedMetadata: updatedMetadata,
                        cliOutput: updateExistingOutput,
                        foundExistingRule: true
                      }
                    });
                  } catch (updateExistingError: any) {
                    console.log('⚠️ Found rule but failed to update it:', updateExistingError.message);
                  }
                }
              }
            } catch (listError: any) {
              console.log('⚠️ Failed to list dispatch rules:', listError.message);
            }
            
            // Clean up temp files
            try {
              unlinkSync(tempFilePath);
              unlinkSync(createFilePath);
              console.log('🧹 Cleaned up temporary config files (after create error)');
            } catch (cleanupError) {
              console.error('Failed to cleanup temp files:', cleanupError);
            }

            return NextResponse.json(
              { 
                error: 'Failed to recreate dispatch rule',
                details: createError.message,
                originalDispatchRuleId: phoneNumber.dispatch_rule_id
              },
              { status: 500 }
            );
          }
        } else {
          // Some other update error, re-throw it
          throw updateError;
        }
      }

    } catch (cliError: any) {
      console.error('❌ Failed to update dispatch rule:', cliError);
      
      // If this is a conflict error, it means there's already a dispatch rule for this phone number
      if (cliError.message && (cliError.message.includes('Conflicting SIP Dispatch Rules') || cliError.message.includes('same Trunk+Number+PIN combination'))) {
        console.log('🔄 Detected conflicting dispatch rule, attempting to find and update existing rule...');
        
        // Try to extract the conflicting dispatch rule ID from the error message
        let conflictingRuleId = null;
        const ruleIdMatch = cliError.message.match(/SDR_\w+/);
        if (ruleIdMatch) {
          conflictingRuleId = ruleIdMatch[0];
          console.log('🎯 Extracted conflicting rule ID from error:', conflictingRuleId);
          
          // Update the phone number record with the conflicting dispatch rule ID
          try {
            await db.updatePhoneNumberDispatchRuleWithServiceRole(body.phoneNumberId, conflictingRuleId);
            console.log('✅ Updated phone number record with conflicting dispatch rule ID');
            
            // Try to update this existing rule with our new metadata
            const updateCommand = `lk sip dispatch update --id ${conflictingRuleId} "${tempFilePath}"`;
            console.log('📝 Executing update command for conflicting rule:', updateCommand);
            
            const { stdout, stderr } = await execAsync(updateCommand);
            console.log('✅ Successfully updated conflicting dispatch rule');
            console.log('📤 CLI Output:', stdout);
            
            // Clean up temp file
            unlinkSync(tempFilePath);
            console.log('🧹 Cleaned up temporary config file');

            return NextResponse.json({
              success: true,
              message: 'Dispatch rule metadata updated successfully (used conflicting rule)',
              data: {
                dispatchRuleId: conflictingRuleId,
                phoneNumber: phoneNumber.phone_number,
                updatedMetadata: updatedMetadata,
                cliOutput: stdout,
                usedConflictingRule: true
              }
            });
          } catch (conflictUpdateError: any) {
            console.log('⚠️ Failed to update conflicting rule directly:', conflictUpdateError.message);
          }
        }
        
        // Fallback: List dispatch rules to find the existing one
        try {
          // List existing dispatch rules to find the one for this phone number
          const { stdout: listOutput } = await execAsync('lk sip dispatch list --json');
          console.log('📋 Dispatch rules list output:', listOutput);
          
          // Extract JSON from CLI output (skip the header line)
          const jsonStart = listOutput.indexOf('{');
          if (jsonStart !== -1) {
            const jsonOutput = listOutput.substring(jsonStart);
            console.log('📋 Extracted dispatch rules JSON:', jsonOutput);
            
            try {
              const rules = JSON.parse(jsonOutput);
              console.log('📋 Parsed dispatch rules:', JSON.stringify(rules, null, 2));
              
              // Find the existing rule for this phone number
              const existingRule = rules.items?.find((rule: any) => 
                (rule.name && rule.name.includes(phoneNumber.phone_number)) ||
                (rule.attributes && rule.attributes.phone_number === phoneNumber.phone_number)
              );
              
              if (existingRule) {
                const existingRuleId = existingRule.sip_dispatch_rule_id;
                console.log('🎯 Found existing dispatch rule:', existingRuleId);
                
                // Update the phone number record with the correct dispatch rule ID
                await db.updatePhoneNumberDispatchRuleWithServiceRole(body.phoneNumberId, existingRuleId);
                console.log('✅ Updated phone number record with existing dispatch rule ID');
                
                // Now try to update this existing rule with our new metadata
                const updateCommand = `lk sip dispatch update --id ${existingRuleId} "${tempFilePath}"`;
                console.log('📝 Executing update command for existing rule:', updateCommand);
                
                const { stdout, stderr } = await execAsync(updateCommand);
                console.log('✅ Successfully updated existing dispatch rule');
                console.log('📤 CLI Output:', stdout);
                
                // Clean up temp file
                unlinkSync(tempFilePath);
                console.log('🧹 Cleaned up temporary config file');

                return NextResponse.json({
                  success: true,
                  message: 'Dispatch rule metadata updated successfully (used existing rule)',
                  data: {
                    dispatchRuleId: existingRuleId,
                    phoneNumber: phoneNumber.phone_number,
                    updatedMetadata: updatedMetadata,
                    cliOutput: stdout,
                    usedExistingRule: true
                  }
                });
              } else {
                console.log('⚠️ Could not find existing dispatch rule in list');
              }
            } catch (parseError) {
              console.log('⚠️ Failed to parse dispatch rules JSON:', parseError);
            }
          } else {
            console.log('⚠️ No JSON found in dispatch rules list output');
          }
        } catch (listError: any) {
          console.log('⚠️ Failed to list dispatch rules:', listError.message);
        }
      }
      
      // Clean up temp file even on error
      try {
        unlinkSync(tempFilePath);
        console.log('🧹 Cleaned up temporary config file (after error)');
      } catch (cleanupError) {
        console.error('Failed to cleanup temp file:', cleanupError);
      }

      return NextResponse.json(
        { 
          error: 'Failed to update dispatch rule',
          details: cliError.message,
          dispatchRuleId: phoneNumber.dispatch_rule_id
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('❌ Update dispatch rule error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error.message
      },
      { status: 500 }
    );
  }
} 