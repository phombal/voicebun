import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/service';
import { supabaseServiceRole } from '@/lib/database/auth';
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
            agentName: "voice-agent",
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
      if (phoneNumber.dispatch_rule_id) {
        // Delete the existing dispatch rule first to avoid conflicts
        console.log('🗑️ Deleting existing dispatch rule:', phoneNumber.dispatch_rule_id);
        
        try {
          await sipClient.deleteSipDispatchRule(phoneNumber.dispatch_rule_id);
          console.log('✅ Existing dispatch rule deleted successfully');
        } catch (deleteError: any) {
          console.log('⚠️ Failed to delete existing dispatch rule (may not exist):', deleteError.message);
          // Continue anyway - the rule might not exist
        }

        // Create new dispatch rule with proper trunk association
        const newDispatchRule = await createDispatchRuleWithTrunk(
          sipClient,
          phoneNumber.phone_number,
          updatedMetadata,
          trunkIds
        );

        // Update the phone number record with the new dispatch rule ID
        const { error: updateError } = await supabaseServiceRole
          .from('phone_numbers')
          .update({ dispatch_rule_id: newDispatchRule.sipDispatchRuleId })
          .eq('id', body.phoneNumberId)
          .eq('user_id', body.userId);

        if (updateError) {
          console.error('❌ Failed to update phone number with dispatch rule ID:', updateError);
          // Try to clean up the created dispatch rule
          try {
            await sipClient.deleteSipDispatchRule(newDispatchRule.sipDispatchRuleId);
          } catch (cleanupError: any) {
            console.error('❌ Failed to cleanup dispatch rule after database update failure:', cleanupError);
          }
          throw new Error(`Database update failed: ${updateError.message}`);
        }

        console.log('✅ Updated phone number record with new dispatch rule ID');

        return NextResponse.json({
          success: true,
          message: 'Dispatch rule recreated with updated metadata successfully',
          data: {
            dispatchRuleId: newDispatchRule.sipDispatchRuleId,
            phoneNumber: phoneNumber.phone_number,
            trunkIds: trunkIds,
            updatedMetadata: updatedMetadata,
            recreated: true
          }
        });

      } else {
        // Create a new dispatch rule
        console.log('🆕 Creating new dispatch rule for phone number:', phoneNumber.phone_number);

        const newDispatchRule = await createDispatchRuleWithTrunk(
          sipClient,
          phoneNumber.phone_number,
          updatedMetadata,
          trunkIds
        );

        // Update the phone number record with the new dispatch rule ID
        const { error: updateError } = await supabaseServiceRole
          .from('phone_numbers')
          .update({ dispatch_rule_id: newDispatchRule.sipDispatchRuleId })
          .eq('id', body.phoneNumberId)
          .eq('user_id', body.userId);

        if (updateError) {
          console.error('❌ Failed to update phone number with dispatch rule ID:', updateError);
          // Try to clean up the created dispatch rule
          try {
            await sipClient.deleteSipDispatchRule(newDispatchRule.sipDispatchRuleId);
          } catch (cleanupError: any) {
            console.error('❌ Failed to cleanup dispatch rule after database update failure:', cleanupError);
          }
          throw new Error(`Database update failed: ${updateError.message}`);
        }

        console.log('✅ Updated phone number record with new dispatch rule ID');

        return NextResponse.json({
          success: true,
          message: 'New dispatch rule created and metadata set successfully',
          data: {
            dispatchRuleId: newDispatchRule.sipDispatchRuleId,
            phoneNumber: phoneNumber.phone_number,
            trunkIds: trunkIds,
            updatedMetadata: updatedMetadata,
            newRule: true
          }
        });
      }

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