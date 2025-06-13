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
        // Delete the existing dispatch rule and recreate it to update both metadata fields
        console.log('🔄 Deleting existing dispatch rule to recreate with updated metadata:', phoneNumber.dispatch_rule_id);
        
        try {
          await sipClient.deleteSipDispatchRule(phoneNumber.dispatch_rule_id);
          console.log('✅ Existing dispatch rule deleted successfully');
        } catch (deleteError: any) {
          console.log('⚠️ Failed to delete existing dispatch rule, proceeding with creation:', deleteError.message);
        }

        // Get trunk IDs for this phone number
        let trunkIds: string[] = [];
        try {
          const trunks = await sipClient.listSipInboundTrunk();
          const matchingTrunk = trunks.find(trunk => 
            trunk.numbers && trunk.numbers.includes(phoneNumber.phone_number)
          );
          
          if (matchingTrunk) {
            trunkIds = [matchingTrunk.sipTrunkId];
            console.log('🎯 Found trunk ID for recreated dispatch rule:', matchingTrunk.sipTrunkId);
          } else {
            console.log('⚠️ No trunk found for phone number, proceeding without trunk IDs');
          }
        } catch (trunkError: any) {
          console.log('⚠️ Could not get trunk ID for recreated dispatch rule:', trunkError.message);
        }

        const rule: SipDispatchRuleIndividual = {
          roomPrefix: "call-",
          type: 'individual',
        };

        const newDispatchRule = await sipClient.createSipDispatchRule(
          rule,
          {
            name: `Dispatch rule for ${phoneNumber.phone_number}`,
            roomConfig: new RoomConfiguration({
              agents: [
                new RoomAgentDispatch({
                  agentName: "voice-agent",
                  metadata: JSON.stringify(updatedMetadata)
                }),]
            }),
            trunkIds: trunkIds,
            metadata: JSON.stringify(updatedMetadata)
          }
        );

        console.log('✅ Dispatch rule recreated successfully:', newDispatchRule.sipDispatchRuleId);

        // Update the phone number record with the new dispatch rule ID
        const { error: updateError1 } = await supabaseServiceRole
          .from('phone_numbers')
          .update({ dispatch_rule_id: newDispatchRule.sipDispatchRuleId })
          .eq('id', body.phoneNumberId)
          .eq('user_id', body.userId);

        if (updateError1) {
          console.error('❌ Failed to update phone number with dispatch rule ID:', updateError1);
        } else {
          console.log('✅ Updated phone number record with new dispatch rule ID');
        }

        return NextResponse.json({
          success: true,
          message: 'Dispatch rule recreated with updated metadata successfully',
          data: {
            dispatchRuleId: newDispatchRule.sipDispatchRuleId,
            phoneNumber: phoneNumber.phone_number,
            updatedMetadata: updatedMetadata,
            recreatedRule: newDispatchRule
          }
        });

      } else {
        // Need to create a new dispatch rule
        console.log('🔄 No existing dispatch rule found, creating new one...');

        // First, get trunk IDs for this phone number
        let trunkIds: string[] = [];
        try {
          const trunks = await sipClient.listSipInboundTrunk();
          const matchingTrunk = trunks.find(trunk => 
            trunk.numbers && trunk.numbers.includes(phoneNumber.phone_number)
          );
          
          if (matchingTrunk) {
            trunkIds = [matchingTrunk.sipTrunkId];
            console.log('🎯 Found trunk ID for new dispatch rule:', matchingTrunk.sipTrunkId);
          } else {
            console.log('⚠️ No trunk found for phone number, proceeding without trunk IDs');
          }
        } catch (trunkError: any) {
          console.log('⚠️ Could not get trunk ID for new dispatch rule:', trunkError.message);
        }

        const rule: SipDispatchRuleIndividual = {
          roomPrefix: "call-",
          type: 'individual',
        };

        const newDispatchRule = await sipClient.createSipDispatchRule(
          rule,
          {
            name: `Dispatch rule for ${phoneNumber.phone_number}`,
            roomConfig: new RoomConfiguration({
              agents: [
                new RoomAgentDispatch({
                  agentName: "voice-agent",
                  metadata: JSON.stringify(updatedMetadata)
                }),]
            }),
            trunkIds: trunkIds,
          }
        );

        console.log('✅ New dispatch rule created successfully:', newDispatchRule.sipDispatchRuleId);

        // Update the phone number record with the new dispatch rule ID
        const { error: updateError2 } = await supabaseServiceRole
          .from('phone_numbers')
          .update({ dispatch_rule_id: newDispatchRule.sipDispatchRuleId })
          .eq('id', body.phoneNumberId)
          .eq('user_id', body.userId);

        if (updateError2) {
          console.error('❌ Failed to update phone number with dispatch rule ID:', updateError2);
        } else {
          console.log('✅ Updated phone number record with new dispatch rule ID');
        }

        return NextResponse.json({
          success: true,
          message: 'New dispatch rule created and metadata set successfully',
          data: {
            dispatchRuleId: newDispatchRule.sipDispatchRuleId,
            phoneNumber: phoneNumber.phone_number,
            updatedMetadata: updatedMetadata,
            newDispatchRule: newDispatchRule,
            recreated: true
          }
        });
      }

    } catch (dispatchError: any) {
      console.error('❌ Dispatch rule operation failed:', dispatchError);

      // Check if this is a "not found" error for update
      if (dispatchError.message && dispatchError.message.includes('not found') && phoneNumber.dispatch_rule_id) {
        console.log('🔄 Dispatch rule not found, attempting to create new one...');
        
        try {
          // Get trunk IDs for this phone number
          let trunkIds: string[] = [];
          try {
            const trunks = await sipClient.listSipInboundTrunk();
            const matchingTrunk = trunks.find(trunk => 
              trunk.numbers && trunk.numbers.includes(phoneNumber.phone_number)
            );
            
            if (matchingTrunk) {
              trunkIds = [matchingTrunk.sipTrunkId];
              console.log('🎯 Found trunk ID for fallback dispatch rule:', matchingTrunk.sipTrunkId);
            }
          } catch (trunkError: any) {
            console.log('⚠️ Could not get trunk ID for fallback dispatch rule:', trunkError.message);
          }

          const rule: SipDispatchRuleIndividual = {
            roomPrefix: "call-",
            type: 'individual',
          };

          const fallbackDispatchRule = await sipClient.createSipDispatchRule(
            rule,
            {
              name: `Dispatch rule for ${phoneNumber.phone_number}`,
              roomConfig: new RoomConfiguration({
                agents: [
                  new RoomAgentDispatch({
                    agentName: "voice-agent",
                    metadata: JSON.stringify(updatedMetadata)
                  }),]
              }),
              trunkIds: trunkIds,
              metadata: JSON.stringify(updatedMetadata)
            }
          );

          console.log('✅ Fallback dispatch rule created successfully:', fallbackDispatchRule.sipDispatchRuleId);

          // Update the phone number record with the new dispatch rule ID
          const { error: updateError3 } = await supabaseServiceRole
            .from('phone_numbers')
            .update({ dispatch_rule_id: fallbackDispatchRule.sipDispatchRuleId })
            .eq('id', body.phoneNumberId)
            .eq('user_id', body.userId);

          if (updateError3) {
            console.error('❌ Failed to update phone number with fallback dispatch rule ID:', updateError3);
          } else {
            console.log('✅ Updated phone number record with fallback dispatch rule ID');
          }

          return NextResponse.json({
            success: true,
            message: 'Dispatch rule recreated and metadata updated successfully',
            data: {
              dispatchRuleId: fallbackDispatchRule.sipDispatchRuleId,
              phoneNumber: phoneNumber.phone_number,
              updatedMetadata: updatedMetadata,
              fallbackDispatchRule: fallbackDispatchRule,
              recreated: true
            }
          });

        } catch (fallbackError: any) {
          console.error('❌ Fallback dispatch rule creation failed:', fallbackError);
          return NextResponse.json(
            { 
              error: 'Failed to create fallback dispatch rule',
              details: fallbackError.message,
              originalDispatchRuleId: phoneNumber.dispatch_rule_id
            },
            { status: 500 }
          );
        }
      }

      return NextResponse.json(
        { 
          error: 'Failed to update dispatch rule',
          details: dispatchError.message,
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