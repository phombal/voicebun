import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/service';
import { supabaseServiceRole } from '@/lib/database/auth';
import { SipClient } from 'livekit-server-sdk';
import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';
import type { SipDispatchRuleIndividual } from 'livekit-server-sdk';

// Get Telnyx API key from environment variables
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

if (!TELNYX_API_KEY) {
  throw new Error('TELNYX_API_KEY environment variable is required');
}

interface AssignPhoneNumberRequest {
  phoneNumberId: string;
  projectId: string;
  userId: string;
  sipHost: string; // LiveKit SIP host
}

export async function POST(request: NextRequest) {
  try {
    const body: AssignPhoneNumberRequest = await request.json();
    console.log('📞 Assigning phone number to project:', {
      phoneNumberId: body.phoneNumberId,
      projectId: body.projectId,
      sipHost: body.sipHost
    });

    // Step 1: Get the phone number from our database using service role to bypass RLS
    const { data: phoneNumber, error: phoneError } = await supabaseServiceRole
      .from('phone_numbers')
      .select('*')
      .eq('id', body.phoneNumberId)
      .eq('user_id', body.userId) // Ensure user owns the phone number
      .single();

    if (phoneError || !phoneNumber) {
      console.error('❌ Phone number not found:', phoneError);
      return NextResponse.json({
        success: false,
        error: 'Phone number not found',
        details: 'The specified phone number ID was not found in the database'
      }, { status: 404 });
    }

    console.log('📱 Found phone number:', phoneNumber.phone_number);

    // Step 2: Verify the project belongs to the user
    const { data: project, error: projectError } = await supabaseServiceRole
      .from('projects')
      .select('*')
      .eq('id', body.projectId)
      .eq('user_id', body.userId)
      .single();

    if (projectError || !project) {
      console.error('❌ Project not found or unauthorized:', projectError);
      return NextResponse.json({
        success: false,
        error: 'Project not found or unauthorized',
        details: 'The specified project was not found or you do not have access to it'
      }, { status: 404 });
    }

    // Step 3: Create FQDN connection in Telnyx
    console.log('🔗 Step 1: Creating FQDN connection...');
    
    // Create a unique connection name to avoid conflicts
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const uniqueConnectionName = `LiveKit-${phoneNumber.phone_number.replace('+', '')}-${timestamp}-${randomId}`;
    
    const fqdnConnectionResponse = await fetch('https://api.telnyx.com/v2/fqdn_connections', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
      },
      body: JSON.stringify({
        active: true,
        anchorsite_override: "Latency",
        connection_name: uniqueConnectionName,
        inbound: {
          ani_number_format: "+E.164",
          dnis_number_format: "+e164"
        }
      })
    });

    if (!fqdnConnectionResponse.ok) {
      const errorText = await fqdnConnectionResponse.text();
      console.error('❌ FQDN connection creation failed:', errorText);
      return NextResponse.json({
        success: false,
        error: 'FQDN Connection Creation Failed',
        details: `Failed to create FQDN connection: ${fqdnConnectionResponse.status} - ${errorText}`
      }, { status: fqdnConnectionResponse.status });
    }

    const fqdnConnectionData = await fqdnConnectionResponse.json();
    const connectionId = fqdnConnectionData.data.id;
    console.log('✅ FQDN connection created:', connectionId);

    // Step 4: Create FQDN with SIP URI
    console.log('🌐 Step 2: Creating FQDN with SIP URI...');
    
    const fqdnResponse = await fetch('https://api.telnyx.com/v2/fqdns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
      },
      body: JSON.stringify({
        connection_id: connectionId,
        fqdn: body.sipHost,
        port: 5060,
        dns_record_type: "a"
      })
    });

    if (!fqdnResponse.ok) {
      const errorText = await fqdnResponse.text();
      console.error('❌ FQDN creation failed:', errorText);
      return NextResponse.json({
        success: false,
        error: 'FQDN Creation Failed',
        details: `Failed to create FQDN: ${fqdnResponse.status} - ${errorText}`
      }, { status: fqdnResponse.status });
    }

    const fqdnData = await fqdnResponse.json();
    console.log('✅ FQDN created:', fqdnData.data.fqdn);

    // Step 5: Get the Telnyx phone number ID using the phone number
    console.log('🔍 Step 3: Getting Telnyx phone number ID...');
    
    const phoneNumberSearchResponse = await fetch(
      `https://api.telnyx.com/v2/phone_numbers?filter[phone_number]=${encodeURIComponent(phoneNumber.phone_number)}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${TELNYX_API_KEY}`,
        }
      }
    );

    if (!phoneNumberSearchResponse.ok) {
      const errorText = await phoneNumberSearchResponse.text();
      console.error('❌ Phone number search failed:', errorText);
      return NextResponse.json({
        success: false,
        error: 'Phone Number Search Failed',
        details: `Failed to find phone number in Telnyx: ${phoneNumberSearchResponse.status} - ${errorText}`
      }, { status: phoneNumberSearchResponse.status });
    }

    const phoneNumberSearchData = await phoneNumberSearchResponse.json();
    if (!phoneNumberSearchData.data || phoneNumberSearchData.data.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Phone Number Not Found in Telnyx',
        details: `Phone number ${phoneNumber.phone_number} was not found in your Telnyx account`
      }, { status: 404 });
    }

    const telnyxPhoneNumberId = phoneNumberSearchData.data[0].id;
    console.log('✅ Found Telnyx phone number ID:', telnyxPhoneNumberId);

    // Step 6: Associate the phone number with the FQDN connection
    console.log('🔗 Step 4: Associating phone number with FQDN connection...');
    
    const associateResponse = await fetch(`https://api.telnyx.com/v2/phone_numbers/${telnyxPhoneNumberId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
      },
      body: JSON.stringify({
        id: telnyxPhoneNumberId,
        connection_id: connectionId
      })
    });

    if (!associateResponse.ok) {
      const errorText = await associateResponse.text();
      console.error('❌ Phone number association failed:', errorText);
      return NextResponse.json({
        success: false,
        error: 'Phone Number Association Failed',
        details: `Failed to associate phone number with connection: ${associateResponse.status} - ${errorText}`
      }, { status: associateResponse.status });
    }

    const associateData = await associateResponse.json();
    console.log('✅ Phone number associated with connection');

    // Step 7: Setup LiveKit inbound trunk with latest configuration
    console.log('🎯 Step 5: Setting up LiveKit inbound trunk with latest project configuration...');
    
    try {
      // First, ensure we have the latest project configuration from Supabase
      console.log('📊 Retrieving latest project configuration from database...');
      const latestProjectData = await db.getProjectDataWithServiceRole(body.projectId);
      console.log('✅ Latest project data retrieved:', latestProjectData ? 'found' : 'not found');
      
      if (latestProjectData) {
        console.log('📋 Project configuration summary:', {
          llm_provider: latestProjectData.llm_provider,
          llm_model: latestProjectData.llm_model,
          tts_provider: latestProjectData.tts_provider,
          tts_voice: latestProjectData.tts_voice,
          stt_provider: latestProjectData.stt_provider,
          stt_language: latestProjectData.stt_language,
          first_message_mode: latestProjectData.first_message_mode,
          response_latency_priority: latestProjectData.response_latency_priority
        });
      }
      
      // Initialize LiveKit SIP client directly
      const sipClient = new SipClient(
        process.env.LIVEKIT_URL!,
        process.env.LIVEKIT_API_KEY!,
        process.env.LIVEKIT_API_SECRET!
      );

      // Setup inbound trunk and dispatch rule directly
      let trunkId: string | null = null;
      let dispatchRuleId: string | null = null;

      // Step 7a: Create or find inbound trunk
      try {
        console.log('📞 Setting up LiveKit inbound trunk...');
        
        // Check if trunk already exists for this phone number
        const existingTrunks = await sipClient.listSipInboundTrunk();
        const existingTrunk = existingTrunks.find(trunk => 
          trunk.numbers && trunk.numbers.includes(phoneNumber.phone_number)
        );

        if (existingTrunk) {
          console.log('✅ Found existing inbound trunk:', existingTrunk.sipTrunkId);
          trunkId = existingTrunk.sipTrunkId;
        } else {
          // Create new inbound trunk
          const newTrunk = await sipClient.createSipInboundTrunk(
            `Inbound trunk for ${phoneNumber.phone_number}`,
            [phoneNumber.phone_number],
            {
              krispEnabled: false
            }
          );
          trunkId = newTrunk.sipTrunkId;
          console.log('✅ LiveKit inbound trunk created successfully:', trunkId);
        }
      } catch (trunkError: any) {
        console.error('❌ Failed to create/find inbound trunk:', trunkError);
        throw new Error(`Inbound trunk setup failed: ${trunkError.message}`);
      }

      // Step 7b: Create dispatch rule with latest project configuration
      if (trunkId) {
        try {
          console.log('🎯 Creating dispatch rule for phone number...');
          
          // Create metadata with latest project configuration
          const roomMetadata = {
            projectId: body.projectId,
            userId: body.userId,
            agentConfig: {
              prompt: latestProjectData?.system_prompt || 'You are a helpful voice assistant.'
            },
            modelConfigurations: {
              // LLM Configuration
              llm: {
                provider: latestProjectData?.llm_provider || 'openai',
                model: latestProjectData?.llm_model || 'gpt-4o-mini',
                temperature: latestProjectData?.llm_temperature || 0.7,
                maxResponseLength: latestProjectData?.llm_max_response_length || 300
              },
              // STT Configuration
              stt: {
                provider: latestProjectData?.stt_provider || 'deepgram',
                language: latestProjectData?.stt_language || 'en',
                quality: latestProjectData?.stt_quality || 'enhanced',
                processingMode: latestProjectData?.stt_processing_mode || 'streaming',
                noiseSuppression: latestProjectData?.stt_noise_suppression ?? true,
                autoPunctuation: latestProjectData?.stt_auto_punctuation ?? true
              },
              // TTS Configuration
              tts: {
                provider: latestProjectData?.tts_provider || 'cartesia',
                voice: latestProjectData?.tts_voice || 'neutral'
              },
              // Additional configurations
              firstMessageMode: latestProjectData?.first_message_mode || 'wait',
              responseLatencyPriority: latestProjectData?.response_latency_priority || 'balanced'
            },
            phoneNumber: phoneNumber.phone_number,
            timestamp: new Date().toISOString()
          };

          console.log('📋 Room metadata to be set:', JSON.stringify(roomMetadata, null, 2));

          // Check for existing dispatch rule
          const existingRules = await sipClient.listSipDispatchRule();
          const existingRule = existingRules.find((rule: any) => 
            (rule.name && rule.name.includes(phoneNumber.phone_number)) ||
            (rule.metadata && JSON.parse(rule.metadata || '{}').phoneNumber === phoneNumber.phone_number)
          );

          if (existingRule) {
            console.log(`📋 Dispatch rule already exists: ${existingRule.sipDispatchRuleId}`);
            dispatchRuleId = existingRule.sipDispatchRuleId;
          } else {
            // Create new dispatch rule
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
                      metadata: JSON.stringify(roomMetadata)
                    }),]
                }),
                trunkIds: [trunkId],
                metadata: JSON.stringify(roomMetadata)
              }
            );
            dispatchRuleId = newDispatchRule.sipDispatchRuleId;
            console.log('✅ LiveKit dispatch rule created successfully:', dispatchRuleId);
          }

          // Update phone number with dispatch rule ID
          if (dispatchRuleId) {
            await db.updatePhoneNumberDispatchRuleWithServiceRole(body.phoneNumberId, dispatchRuleId);
            console.log('✅ Updated phone number with dispatch rule ID');
          }

        } catch (dispatchError: any) {
          console.error('❌ Failed to create dispatch rule:', dispatchError);
          // Continue with success even if dispatch rule fails
        }
      }
      
    } catch (liveKitError) {
      console.error('❌ LiveKit inbound trunk setup failed:', liveKitError);
      // Don't fail the request - Telnyx setup was successful
    }

    // Step 8: Update our database with assignment status
    console.log('💾 Step 6: Updating database with assignment status...');
    
    try {
      const { error: updateError } = await supabaseServiceRole
        .from('phone_numbers')
        .update({
          status: 'assigned',
          project_id: body.projectId, // Set the project ID to mark as assigned
          voice_agent_enabled: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', body.phoneNumberId)
        .eq('user_id', body.userId); // Ensure user owns the phone number

      if (updateError) {
        console.error('❌ Database update failed:', updateError);
        // Don't fail the request if DB update fails, the Telnyx setup was successful
      } else {
        console.log('✅ Database updated successfully');
      }
    } catch (dbError) {
      console.error('❌ Database update failed:', dbError);
      // Don't fail the request if DB update fails, the Telnyx setup was successful
    }

    return NextResponse.json({
      success: true,
      message: 'Phone number successfully assigned to project with LiveKit integration',
      data: {
        phoneNumber: phoneNumber.phone_number,
        connectionId: connectionId,
        fqdn: fqdnData.data.fqdn,
        sipHost: body.sipHost,
        telnyxPhoneNumberId: telnyxPhoneNumberId
      }
    });

  } catch (error: any) {
    console.error('❌ Phone number assignment error:', error);
    return NextResponse.json({
      success: false,
      error: 'Phone Number Assignment Failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred',
      fullError: error
    }, { status: 500 });
  }
} 