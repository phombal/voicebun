import { NextRequest, NextResponse } from 'next/server';
import { supabaseServiceRole } from '@/lib/database/server';
import { SipClient, AgentDispatchClient } from 'livekit-server-sdk';
import { db } from '@/lib/database/service';

interface MakeOutboundCallRequest {
  phoneNumberId: string;
  projectId: string;
  userId: string;
  toNumber: string; // The number to call
}

export async function POST(request: NextRequest) {
  try {
    const body: MakeOutboundCallRequest = await request.json();
    console.log('📞 Making outbound call:', {
      phoneNumberId: body.phoneNumberId,
      projectId: body.projectId,
      callToNumber: body.toNumber
    });

    // Step 1: Get the phone number from our database
    const { data: phoneNumber, error: phoneError } = await supabaseServiceRole
      .from('phone_numbers')
      .select('*')
      .eq('id', body.phoneNumberId)
      .eq('user_id', body.userId)
      .eq('status', 'assigned')
      .single();

    if (phoneError || !phoneNumber) {
      console.error('❌ Phone number not found or not assigned:', phoneError);
      return NextResponse.json({
        success: false,
        error: 'Phone number not found or not assigned',
        details: 'The specified phone number must be assigned to a project first'
      }, { status: 404 });
    }

    // Step 2: Verify the project belongs to the user and get project data
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
        error: 'Project not found or unauthorized'
      }, { status: 404 });
    }

    // Get project configuration data for agent metadata
    let projectData = null;
    try {
      console.log('🔍 Attempting to get project data for projectId:', body.projectId);
      console.log('🔍 Project object from previous query:', project ? { id: project.id, title: project.title } : 'null');
      
      projectData = await db.getProjectDataWithServiceRole(body.projectId);
      console.log('📋 Project data retrieval result:', projectData ? 'Found' : 'Not found');
      
      if (projectData) {
        console.log('✅ Project data details:', {
          id: projectData.id,
          hasSystemPrompt: !!projectData.system_prompt,
          systemPromptPreview: projectData.system_prompt ? projectData.system_prompt.substring(0, 100) + '...' : 'none',
          llmProvider: projectData.llm_provider,
          llmModel: projectData.llm_model,
          ttsProvider: projectData.tts_provider,
          version: projectData.version,
          isActive: projectData.is_active
        });
      } else {
        console.log('⚠️ No project data found, will use fallback values');
      }
    } catch (dbError) {
      console.error('❌ Failed to get project data:', dbError);
      // Continue without project data - use fallback values
    }

    // Step 3: Get the outbound trunk ID for this phone number
    if (!phoneNumber.dispatch_rule_id) {
      return NextResponse.json({
        success: false,
        error: 'Phone number not properly configured',
        details: 'No dispatch rule found. Please reconnect the phone number.'
      }, { status: 400 });
    }

    // Step 4: Initialize LiveKit clients
    const sipClient = new SipClient(
      process.env.LIVEKIT_URL!,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    );

    const agentDispatchClient = new AgentDispatchClient(
      process.env.LIVEKIT_URL!,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    );

    // Step 5: Get outbound trunks to find the one for this phone number
    try {
      const outboundTrunks = await sipClient.listSipOutboundTrunk();
      const outboundTrunk = outboundTrunks.find(trunk => 
        trunk.name && trunk.name.includes(phoneNumber.phone_number)
      );

      if (!outboundTrunk) {
        return NextResponse.json({
          success: false,
          error: 'Outbound trunk not found',
          details: 'No outbound trunk configured for this phone number. Please reconnect the phone number to enable outbound calling.'
        }, { status: 400 });
      }

      console.log('✅ Found outbound trunk:', outboundTrunk.sipTrunkId);

      // Step 6: Create a unique room name for this call
      const timestamp = Date.now();
      const roomName = `outbound-call-${phoneNumber.phone_number.replace(/[^0-9]/g, '')}-${timestamp}`;

      // Step 7: Dispatch AI agent first (outbound calls need explicit dispatch)
      console.log('🤖 Dispatching AI agent to handle the outbound call...');
      console.log('ℹ️  Note: Outbound calls require explicit dispatch since dispatch rules only apply to inbound trunks');
      
      const agentName = 'voice-agent';
      const agentMetadata = JSON.stringify({
        projectId: project.id,
        phoneNumber: phoneNumber.phone_number,
        callType: 'outbound',
        targetNumber: body.toNumber,
        sipTrunkId: outboundTrunk.sipTrunkId,
        agentConfig: {
          prompt: projectData?.system_prompt || project.initial_prompt || 'You are a helpful voice assistant.'
        },
        timestamp: timestamp,
        userId: body.userId,
        // Add model configurations for the Python agent
        modelConfigurations: {
          llm: {
            provider: projectData?.llm_provider || 'openai',
            model: projectData?.llm_model || 'gpt-4o-mini',
            temperature: projectData?.llm_temperature || 0.7,
            maxResponseLength: projectData?.llm_max_response_length || 300
          },
          tts: {
            provider: projectData?.tts_provider || 'cartesia',
            voice: projectData?.tts_voice || 'neutral'
          },
          stt: {
            provider: projectData?.stt_provider || 'deepgram',
            model: 'nova-2',
            language: projectData?.stt_language || 'en',
            quality: projectData?.stt_quality || 'enhanced',
            processingMode: projectData?.stt_processing_mode || 'streaming',
            noiseSuppression: projectData?.stt_noise_suppression ?? true,
            autoPunctuation: projectData?.stt_auto_punctuation ?? true
          },
          firstMessageMode: projectData?.first_message_mode || 'wait',
          responseLatencyPriority: projectData?.response_latency_priority || 'balanced'
        }
      });

      try {
        const dispatch = await agentDispatchClient.createDispatch(
          roomName,
          agentName,
          { metadata: agentMetadata }
        );
        console.log('✅ AI agent dispatched successfully:', dispatch);
      } catch (dispatchError) {
        console.error('❌ Failed to dispatch agent:', dispatchError);
        return NextResponse.json({
          success: false,
          error: 'Failed to dispatch AI agent for outbound call',
          details: dispatchError instanceof Error ? dispatchError.message : 'Unknown dispatch error'
        }, { status: 500 });
      }

      // Step 8: Create SIP participant for outbound call
      console.log('📞 Creating SIP participant for outbound call...');
      
      const sipParticipantInfo = await sipClient.createSipParticipant(
        outboundTrunk.sipTrunkId,
        body.toNumber,
        roomName,
        {
          participantIdentity: `sip-outbound-${timestamp}`,
          participantName: `Outbound call to ${body.toNumber}`,
          participantMetadata: agentMetadata
        }
      );

      console.log('✅ SIP participant created successfully:', sipParticipantInfo.participantIdentity);

      return NextResponse.json({
        success: true,
        message: `Outbound call initiated to ${body.toNumber} from ${phoneNumber.phone_number}`,
        data: {
          roomName: roomName,
          fromNumber: phoneNumber.phone_number,
          toNumber: body.toNumber,
          participantIdentity: sipParticipantInfo.participantIdentity,
          agentName: 'voice-agent',
          trunkId: outboundTrunk.sipTrunkId
        }
      });

    } catch (sipError: any) {
      console.error('❌ Failed to create outbound call:', sipError);
      return NextResponse.json({
        success: false,
        error: 'Failed to initiate outbound call',
        details: sipError.message || 'Unknown SIP error occurred'
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('❌ Outbound call error:', error);
    return NextResponse.json({
      success: false,
      error: 'Outbound call failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
} 