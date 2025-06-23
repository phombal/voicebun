import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/service';
import { supabaseServiceRole } from '@/lib/database/server';
import { SipClient } from 'livekit-server-sdk';
import type { SipDispatchRuleIndividual } from 'livekit-server-sdk';
import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';

interface UpdateDispatchRuleRequest {
  phoneNumberId: string;
  projectId: string;
  userId: string;
  agentConfig: {
    prompt: string;
  };
  modelConfigurations: {
    llm: {
      provider: string;
      model: string;
      temperature: number;
      maxResponseLength: number;
    };
    stt: {
      provider: string;
      language: string;
      quality: string;
      processingMode: string;
      noiseSuppression: boolean;
      autoPunctuation: boolean;
    };
    tts: {
      provider: string;
      voice: string;
    };
    firstMessageMode: string;
    responseLatencyPriority: string;
  };
}

// Helper function to get trunk IDs for a phone number
async function getTrunkIdsForPhoneNumber(sipClient: SipClient, phoneNumber: string): Promise<string[]> {
  try {
    console.log('🔍 Searching for trunks containing phone number:', phoneNumber);
    const trunks = await sipClient.listSipInboundTrunk();
    console.log('📋 Available trunks:', trunks.map(t => ({ id: t.sipTrunkId, numbers: t.numbers })));
    
    const matchingTrunks = trunks.filter(trunk => 
      trunk.numbers && trunk.numbers.includes(phoneNumber)
    );
    
    const trunkIds = matchingTrunks.map(trunk => trunk.sipTrunkId);
    console.log('🎯 Matching trunk IDs for phone number', phoneNumber, ':', trunkIds);
    
    if (trunkIds.length === 0) {
      console.warn('⚠️ No trunks found for phone number:', phoneNumber);
      console.log('📞 Available phone numbers across all trunks:', 
        trunks.flatMap(t => t.numbers || [])
      );
    }
    
    return trunkIds;
  } catch (error: any) {
    console.error('❌ Error getting trunk IDs:', error);
    throw new Error(`Failed to get trunk IDs: ${error.message}`);
  }
}

// Helper function to create dispatch rule with proper trunk association
async function createDispatchRuleWithTrunk(
  sipClient: SipClient, 
  phoneNumber: string, 
  updatedMetadata: any,
  trunkIds: string[]
) {
  if (trunkIds.length === 0) {
    throw new Error(`No trunks found for phone number ${phoneNumber}. Cannot create dispatch rule without trunk association.`);
  }

  console.log('🔧 Creating dispatch rule with trunk IDs:', trunkIds);

  const rule: SipDispatchRuleIndividual = {
    roomPrefix: "call-",
    type: 'individual',
  };

  const dispatchRule = await sipClient.createSipDispatchRule(
    rule,
    {
      name: `Dispatch rule for ${phoneNumber}`,
      roomConfig: new RoomConfiguration({
        agents: [
          new RoomAgentDispatch({
            agentName: 'voice-agent',
            metadata: JSON.stringify(updatedMetadata)
          }),
        ]
      }),
      trunkIds: trunkIds, // Ensure trunk IDs are always provided
      metadata: JSON.stringify(updatedMetadata)
    }
  );

  console.log('✅ Dispatch rule created successfully:', {
    id: dispatchRule.sipDispatchRuleId,
    trunkIds: trunkIds,
    phoneNumber: phoneNumber
  });

  return dispatchRule;
}

// Helper function to find and clean up all dispatch rules for a phone number
async function cleanupExistingDispatchRules(sipClient: SipClient, phoneNumber: string, trunkIds: string[]): Promise<void> {
  try {
    console.log('🧹 Cleaning up existing dispatch rules for phone number:', phoneNumber);
    console.log('🎯 Target trunk IDs:', trunkIds);
    
    // List all existing dispatch rules
    const existingRules = await sipClient.listSipDispatchRule();
    console.log('📋 Total existing dispatch rules:', existingRules.length);
    
    // Find rules that might conflict with our phone number/trunk combination
    const conflictingRules = existingRules.filter(rule => {
      // Check if rule has trunk IDs that match ours
      const hasMatchingTrunk = rule.trunkIds && rule.trunkIds.some(id => trunkIds.includes(id));
      
      // Check if rule metadata contains our phone number
      let hasMatchingPhone = false;
      if (rule.metadata) {
        try {
          const metadata = JSON.parse(rule.metadata);
          hasMatchingPhone = metadata.phoneNumber === phoneNumber;
        } catch {
          // Ignore JSON parse errors
        }
      }
      
      return hasMatchingTrunk || hasMatchingPhone;
    });
    
    console.log('⚠️ Found potentially conflicting dispatch rules:', conflictingRules.map(r => ({
      id: r.sipDispatchRuleId,
      trunkIds: r.trunkIds,
      name: r.name
    })));
    
    // Delete all conflicting rules
    for (const rule of conflictingRules) {
      try {
        console.log('🗑️ Deleting conflicting dispatch rule:', rule.sipDispatchRuleId);
        await sipClient.deleteSipDispatchRule(rule.sipDispatchRuleId);
        console.log('✅ Successfully deleted dispatch rule:', rule.sipDispatchRuleId);
      } catch (deleteError: any) {
        console.log('⚠️ Failed to delete dispatch rule', rule.sipDispatchRuleId, ':', deleteError.message);
        // Continue with other rules even if one fails
      }
    }
    
    console.log('🧹 Cleanup completed for phone number:', phoneNumber);
    
  } catch (error: any) {
    console.error('❌ Error during dispatch rule cleanup:', error);
    // Don't throw here - we want to continue with creation even if cleanup partially fails
  }
}

// Helper function to check if a dispatch rule has the correct configuration
async function isDispatchRuleCorrect(
  sipClient: SipClient, 
  dispatchRuleId: string, 
  expectedMetadata: any,
  expectedTrunkIds: string[]
): Promise<boolean> {
  try {
    const rules = await sipClient.listSipDispatchRule();
    const rule = rules.find(r => r.sipDispatchRuleId === dispatchRuleId);
    
    if (!rule) {
      console.log('🔍 Dispatch rule not found:', dispatchRuleId);
      return false;
    }

    // Check trunk IDs
    const trunkIdsMatch = rule.trunkIds && 
      rule.trunkIds.length === expectedTrunkIds.length &&
      rule.trunkIds.every(id => expectedTrunkIds.includes(id));

    if (!trunkIdsMatch) {
      console.log('🔍 Trunk IDs mismatch:', { current: rule.trunkIds, expected: expectedTrunkIds });
      return false;
    }

    // Check metadata
    if (rule.metadata) {
      try {
        const currentMetadata = JSON.parse(rule.metadata);
        const metadataMatch = 
          currentMetadata.projectId === expectedMetadata.projectId &&
          currentMetadata.userId === expectedMetadata.userId &&
          currentMetadata.phoneNumber === expectedMetadata.phoneNumber;

        if (!metadataMatch) {
          console.log('🔍 Metadata mismatch detected');
          return false;
        }
      } catch {
        console.log('🔍 Failed to parse existing metadata');
        return false;
      }
    } else {
      console.log('🔍 No metadata in existing rule');
      return false;
    }

    console.log('✅ Existing dispatch rule is correct');
    return true;
  } catch (error: any) {
    console.error('❌ Error checking dispatch rule:', error);
    return false;
  }
}

// Helper function to update dispatch rule metadata without recreating
async function updateDispatchRuleMetadata(
  sipClient: SipClient,
  dispatchRuleId: string,
  updatedMetadata: any
): Promise<string> {
  try {
    console.log('🔄 Updating existing dispatch rule metadata:', dispatchRuleId);
    
    // For now, we'll delete and recreate since direct metadata update might not be supported
    // This is more efficient than the current approach because we only do it when needed
    const rules = await sipClient.listSipDispatchRule();
    const currentRule = rules.find(r => r.sipDispatchRuleId === dispatchRuleId);
    
    if (!currentRule) {
      throw new Error('Dispatch rule not found for update');
    }

    // Delete the existing rule
    await sipClient.deleteSipDispatchRule(dispatchRuleId);
    console.log('🗑️ Deleted existing dispatch rule for update');

    // Create new rule with updated metadata and same trunk IDs
    const rule: SipDispatchRuleIndividual = {
      roomPrefix: "call-",
      type: 'individual',
    };

    const newDispatchRule = await sipClient.createSipDispatchRule(
      rule,
      {
        name: currentRule.name || `Dispatch rule for phone number`,
        roomConfig: new RoomConfiguration({
          agents: [
            new RoomAgentDispatch({
              agentName: 'voice-agent',
              metadata: JSON.stringify(updatedMetadata)
            }),
          ]
        }),
        trunkIds: currentRule.trunkIds || [],
        metadata: JSON.stringify(updatedMetadata)
      }
    );

    console.log('✅ Successfully recreated dispatch rule with updated metadata:', newDispatchRule.sipDispatchRuleId);
    return newDispatchRule.sipDispatchRuleId;
  } catch (error: any) {
    console.error('❌ Failed to update dispatch rule metadata:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Starting dispatch rule metadata update...');
    
    const body: UpdateDispatchRuleRequest = await request.json();
    console.log('📝 Request body:', {
      phoneNumberId: body.phoneNumberId,
      projectId: body.projectId,
      userId: body.userId
    });

    if (!body.phoneNumberId || !body.projectId || !body.userId) {
      return NextResponse.json(
        { error: 'Missing required fields: phoneNumberId, projectId, and userId' },
        { status: 400 }
      );
    }

    // Initialize LiveKit SIP client
    const sipClient = new SipClient(
      process.env.LIVEKIT_URL!,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    );

    // Get phone number details using service role to bypass RLS
    const { data: phoneNumber, error: phoneError } = await supabaseServiceRole
      .from('phone_numbers')
      .select('*')
      .eq('id', body.phoneNumberId)
      .eq('user_id', body.userId)
      .single();

    if (phoneError || !phoneNumber) {
      console.error('❌ Phone number not found:', phoneError);
      return NextResponse.json(
        { error: 'Phone number not found' },
        { status: 404 }
      );
    }

    console.log('📞 Phone number details:', {
      phone: phoneNumber.phone_number,
      dispatchRuleId: phoneNumber.dispatch_rule_id
    });

    // Get trunk IDs for this phone number first
    let trunkIds: string[];
    try {
      trunkIds = await getTrunkIdsForPhoneNumber(sipClient, phoneNumber.phone_number);
      if (trunkIds.length === 0) {
        return NextResponse.json(
          { 
            error: 'No trunks found for this phone number',
            details: `Phone number ${phoneNumber.phone_number} is not associated with any SIP trunk`
          },
          { status: 400 }
        );
      }
    } catch (trunkError: any) {
      console.error('❌ Failed to get trunk IDs:', trunkError);
      return NextResponse.json(
        { 
          error: 'Failed to identify trunk for phone number',
          details: trunkError.message
        },
        { status: 500 }
      );
    }

    // Get the latest project configuration
    const projectData = await db.getProjectDataWithServiceRole(body.projectId);
    console.log('🔍 Project data retrieved:', projectData ? 'Found' : 'Not found');

    // Create updated metadata
    const updatedMetadata = {
      projectId: body.projectId,
      userId: body.userId,
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

    try {
      let finalDispatchRuleId: string;

      if (phoneNumber.dispatch_rule_id) {
        console.log('🔍 Checking if existing dispatch rule is correct...');
        
        // Check if the existing dispatch rule has correct configuration
        const isCorrect = await isDispatchRuleCorrect(
          sipClient,
          phoneNumber.dispatch_rule_id,
          updatedMetadata,
          trunkIds
        );

        if (isCorrect) {
          console.log('✅ Existing dispatch rule is already correct, updating metadata only...');
          finalDispatchRuleId = await updateDispatchRuleMetadata(
            sipClient,
            phoneNumber.dispatch_rule_id,
            updatedMetadata
          );
        } else {
          console.log('🔄 Existing dispatch rule needs to be replaced...');
          // Clean up and recreate
          await cleanupExistingDispatchRules(sipClient, phoneNumber.phone_number, trunkIds);
          const newDispatchRule = await createDispatchRuleWithTrunk(
            sipClient,
            phoneNumber.phone_number,
            updatedMetadata,
            trunkIds
          );
          finalDispatchRuleId = newDispatchRule.sipDispatchRuleId;
        }
      } else {
        console.log('🆕 No existing dispatch rule, creating new one...');
        // Check for any existing rules that might conflict and clean them up
        await cleanupExistingDispatchRules(sipClient, phoneNumber.phone_number, trunkIds);
        
        const newDispatchRule = await createDispatchRuleWithTrunk(
          sipClient,
          phoneNumber.phone_number,
          updatedMetadata,
          trunkIds
        );
        finalDispatchRuleId = newDispatchRule.sipDispatchRuleId;
      }

      // Update the phone number record with the dispatch rule ID (might be the same or new)
      if (finalDispatchRuleId !== phoneNumber.dispatch_rule_id) {
        const { error: updateError } = await supabaseServiceRole
          .from('phone_numbers')
          .update({ dispatch_rule_id: finalDispatchRuleId })
          .eq('id', body.phoneNumberId)
          .eq('user_id', body.userId);

        if (updateError) {
          console.error('❌ Failed to update phone number with dispatch rule ID:', updateError);
          // Try to clean up the created dispatch rule if it's new
          if (finalDispatchRuleId !== phoneNumber.dispatch_rule_id) {
            try {
              await sipClient.deleteSipDispatchRule(finalDispatchRuleId);
            } catch (cleanupError: any) {
              console.error('❌ Failed to cleanup dispatch rule after database update failure:', cleanupError);
            }
          }
          throw new Error(`Database update failed: ${updateError.message}`);
        }

        console.log('✅ Updated phone number record with dispatch rule ID:', finalDispatchRuleId);
      } else {
        console.log('✅ Phone number record already has correct dispatch rule ID');
      }

      return NextResponse.json({
        success: true,
        message: 'Dispatch rule updated successfully',
        data: {
          dispatchRuleId: finalDispatchRuleId,
          phoneNumber: phoneNumber.phone_number,
          trunkIds: trunkIds,
          updatedMetadata: updatedMetadata,
          wasRecreated: finalDispatchRuleId !== phoneNumber.dispatch_rule_id
        }
      });

    } catch (dispatchError: any) {
      console.error('❌ Dispatch rule operation failed:', dispatchError);
      
      return NextResponse.json(
        { 
          error: 'Failed to create/update dispatch rule',
          details: dispatchError.message,
          phoneNumber: phoneNumber.phone_number,
          trunkIds: trunkIds
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