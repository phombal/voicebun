import { NextRequest, NextResponse } from "next/server";
import { db } from '@/lib/database/service';
import { AccessToken } from 'livekit-server-sdk';

const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

export async function POST(request: NextRequest) {
  console.log('🤖 Starting explicit agent dispatch...');
  
  try {
    const body = await request.json();
    const { roomName, agentName = "voice-agent", projectId, metadata } = body;
    
    console.log('📝 Agent dispatch request:', {
      roomName,
      agentName,
      projectId,
      hasMetadata: !!metadata
    });

    if (!roomName) {
      return NextResponse.json(
        { error: 'Room name is required' },
        { status: 400 }
      );
    }

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // Get project configuration for the metadata
    let projectData = null;
    try {
      projectData = await db.getProjectDataWithServiceRole(projectId);
      console.log('🔍 Project data retrieved:', projectData ? 'Found' : 'Not found');
    } catch (dbError) {
      console.error('❌ Failed to get project data:', dbError);
      // Continue without project data - use provided metadata
    }

    // Create enhanced metadata with project configuration
    const enhancedMetadata = {
      projectId,
      agentConfig: {
        prompt: projectData?.system_prompt || metadata?.agentConfig?.prompt || 'You are a helpful voice assistant.'
      },
      modelConfigurations: {
        llm: {
          provider: projectData?.llm_provider || 'openai',
          model: projectData?.llm_model || 'gpt-4o-mini',
          temperature: projectData?.llm_temperature || 0.7,
          maxResponseLength: projectData?.llm_max_response_length || 300
        },
        stt: {
          provider: projectData?.stt_provider || 'deepgram',
          language: projectData?.stt_language || 'en',
          quality: projectData?.stt_quality || 'enhanced',
          processingMode: projectData?.stt_processing_mode || 'streaming',
          noiseSuppression: projectData?.stt_noise_suppression ?? true,
          autoPunctuation: projectData?.stt_auto_punctuation ?? true
        },
        tts: {
          provider: projectData?.tts_provider || 'cartesia',
          voice: projectData?.tts_voice || 'neutral'
        },
        firstMessageMode: projectData?.first_message_mode || 'wait',
        responseLatencyPriority: projectData?.response_latency_priority || 'balanced'
      },
      timestamp: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      ...metadata // Include any additional metadata passed from the client
    };

    console.log('📋 Enhanced metadata prepared:', {
      projectId,
      llmModel: enhancedMetadata.modelConfigurations.llm.model,
      sttProvider: enhancedMetadata.modelConfigurations.stt.provider,
      ttsProvider: enhancedMetadata.modelConfigurations.tts.provider,
      metadataSize: JSON.stringify(enhancedMetadata).length
    });

    // Generate JWT token for LiveKit API authentication
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: 'dispatch-service',
      // Add necessary grants for agent dispatch
      ttl: '10m'
    });
    
    // Add room admin permissions to create agent dispatches
    at.addGrant({
      roomAdmin: true,
      room: roomName
    });

    const token = await at.toJwt();
    console.log('🔐 Generated LiveKit JWT token for agent dispatch');

    // Use LiveKit REST API to create agent dispatch
    const livekitApiUrl = LIVEKIT_URL?.replace('wss://', 'https://').replace('ws://', 'http://');
    const dispatchUrl = `${livekitApiUrl}/twirp/livekit.AgentDispatchService/CreateDispatch`;
    
    const dispatchRequest = {
      agent_name: agentName,
      room: roomName,
      metadata: JSON.stringify(enhancedMetadata)
    };

    console.log('🚀 Sending dispatch request to LiveKit:', {
      url: dispatchUrl,
      agentName,
      roomName,
      metadataLength: dispatchRequest.metadata.length
    });
    
    const response = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(dispatchRequest)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ LiveKit dispatch failed:', response.status, errorText);
      throw new Error(`Failed to create agent dispatch: ${response.status} ${errorText}`);
    }

    const dispatchResult = await response.json();
    console.log('✅ Agent dispatch created successfully:', dispatchResult);

    return NextResponse.json({
      success: true,
      dispatch: dispatchResult,
      metadata: enhancedMetadata,
      message: 'Agent dispatch created successfully'
    });

  } catch (error) {
    console.error('❌ Agent dispatch failed:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create agent dispatch',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 