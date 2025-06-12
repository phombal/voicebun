import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/service';
import { SipClient } from 'livekit-server-sdk';
import type { SipDispatchRuleIndividual } from 'livekit-server-sdk';
import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';

interface SetupLiveKitTrunkRequest {
  phoneNumberId: string;
  phoneNumber: string;
  projectId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SetupLiveKitTrunkRequest = await request.json();
    console.log('🎯 Setting up LiveKit inbound trunk for:', body.phoneNumber);

    // Initialize LiveKit SIP client
    const sipClient = new SipClient(
      process.env.LIVEKIT_URL!,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    );

    // Step 1: Create inbound trunk
    console.log('🔧 Creating inbound trunk via LiveKit SDK...');
    
    let trunkId: string | null = null;
    try {
      // Check if trunk already exists for this phone number
      const existingTrunks = await sipClient.listSipInboundTrunk();
      const existingTrunk = existingTrunks.find(trunk => 
        trunk.numbers && trunk.numbers.includes(body.phoneNumber)
      );
      
      if (existingTrunk) {
        trunkId = existingTrunk.sipTrunkId;
        console.log('📋 Inbound trunk already exists:', trunkId);
      } else {
        // Create new trunk using correct API signature
        const newTrunk = await sipClient.createSipInboundTrunk(
          `Inbound trunk for ${body.phoneNumber}`,
          [body.phoneNumber],
          {
            krispEnabled: false
          }
        );
        trunkId = newTrunk.sipTrunkId;
        console.log('✅ LiveKit inbound trunk created successfully:', trunkId);
      }
    } catch (trunkError: any) {
      console.error('❌ Failed to create/find inbound trunk:', trunkError);
      return NextResponse.json(
        { 
          error: 'Failed to setup inbound trunk',
          details: trunkError.message
        },
        { status: 500 }
      );
    }
      
      // Step 2: Create dispatch rule for this phone number
      console.log('🎯 Creating dispatch rule for phone number...');
      
      let dispatchRuleCreated = false;
    let dispatchRuleId: string | null = null;
      
      try {
      // Get project configuration for metadata using service role to bypass RLS
      const projectData = await db.getProjectDataWithServiceRole(body.projectId);
      console.log('🔍 Project data retrieved:', projectData ? 'Found' : 'Not found');
        
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

      console.log('📋 Room metadata to be set:', JSON.stringify(roomMetadata, null, 2));

        // Check if dispatch rule already exists for this phone number
        try {
          console.log('📋 Checking for existing dispatch rules...');
        const existingRules = await sipClient.listSipDispatchRule();
          
          // Find existing rule for this phone number
        const existingRule = existingRules.find((rule: any) => 
            (rule.name && rule.name.includes(body.phoneNumber)) ||
          (rule.metadata && JSON.parse(rule.metadata || '{}').phoneNumber === body.phoneNumber)
          );
          
          if (existingRule) {
          console.log(`📋 Dispatch rule already exists: ${existingRule.sipDispatchRuleId} (${existingRule.name})`);
          dispatchRuleId = existingRule.sipDispatchRuleId;
            dispatchRuleCreated = true;
          } else {
          // Create new dispatch rule via SDK
          console.log('📝 Creating new dispatch rule via SDK...');
          
          const rule: SipDispatchRuleIndividual = {
            roomPrefix: "call-",
            type: 'individual',
          };

          // Use the SDK's createSipDispatchRule with correct parameters
          const newDispatchRule = await sipClient.createSipDispatchRule(
            rule,
            {
              name: `Dispatch rule for ${body.phoneNumber}`,
              roomConfig: new RoomConfiguration({
                agents: [
                  new RoomAgentDispatch({
                    agentName: "voice-agent",
                    metadata: JSON.stringify(roomMetadata)
                }),]
              }),
              trunkIds: trunkId ? [trunkId] : [],
            }
          );
          dispatchRuleId = newDispatchRule.sipDispatchRuleId;
          console.log('✅ LiveKit dispatch rule created successfully:', dispatchRuleId);
          dispatchRuleCreated = true;
        }
        
        // Update phone number with dispatch rule ID
        if (dispatchRuleId) {
          try {
            await db.updatePhoneNumberDispatchRuleWithServiceRole(body.phoneNumberId, dispatchRuleId);
            console.log('✅ Updated phone number with dispatch rule ID');
          } catch (updateError) {
            console.error('⚠️ Failed to update phone number with dispatch rule ID:', updateError);
          }
        }
        
      } catch (dispatchListError: any) {
        console.error('❌ Failed to list existing dispatch rules:', dispatchListError);
        
        // Try to create a new dispatch rule anyway
        try {
          console.log('🔄 Attempting to create dispatch rule despite list error...');
          
          const rule: SipDispatchRuleIndividual = {
            roomPrefix: "call-",
            type: 'individual',
          };

          const fallbackDispatchRule = await sipClient.createSipDispatchRule(
            rule,
            {
              name: `Dispatch rule for ${body.phoneNumber}`,
              roomConfig: new RoomConfiguration({
                agents: [
                  new RoomAgentDispatch({
                    agentName: "inbound-agent",
                    metadata: JSON.stringify(roomMetadata)
                  }),]
              }),
              trunkIds: trunkId ? [trunkId] : [],
              metadata: JSON.stringify(roomMetadata)
            }
          );
          dispatchRuleId = fallbackDispatchRule.sipDispatchRuleId;
          console.log('✅ Fallback dispatch rule created successfully:', dispatchRuleId);
          dispatchRuleCreated = true;
          
          // Update phone number with dispatch rule ID
          if (dispatchRuleId) {
            try {
              await db.updatePhoneNumberDispatchRuleWithServiceRole(body.phoneNumberId, dispatchRuleId);
              console.log('✅ Updated phone number with fallback dispatch rule ID');
            } catch (updateError) {
              console.error('⚠️ Failed to update phone number with fallback dispatch rule ID:', updateError);
            }
          }
          
        } catch (fallbackCreateError: any) {
          console.error('❌ Fallback dispatch rule creation also failed:', fallbackCreateError);
          // Continue with trunk setup success even if dispatch rule fails
        }
      }

    } catch (dispatchError: any) {
      console.error('❌ Failed to create dispatch rule:', dispatchError);
      // Continue with trunk setup success even if dispatch rule fails
    }

    // Return success response
      return NextResponse.json({
        success: true,
      message: 'LiveKit trunk setup completed',
        data: {
        trunkId: trunkId,
        dispatchRuleId: dispatchRuleId,
        dispatchRuleCreated: dispatchRuleCreated,
          phoneNumber: body.phoneNumber,
        projectId: body.projectId
        }
      });

  } catch (error: any) {
    console.error('❌ LiveKit trunk setup error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error.message
      },
      { status: 500 }
    );
  }
} 