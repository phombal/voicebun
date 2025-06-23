import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from 'livekit-server-sdk';

const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

export async function POST(request: NextRequest) {
  console.log('🤖 Starting explicit agent dispatch...');
  
  try {
    const body = await request.json();
    const { roomName, agentName, projectId, userId, metadata } = body;
    
    console.log('📝 Agent dispatch request:', {
      roomName,
      agentName,
      projectId,
      userId,
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

    // Create metadata with essential user and project information
    const enhancedMetadata = {
      projectId,
      userId: userId || null,
      isCommunityProject: true,
      timestamp: new Date().toISOString(),
      // Include any additional metadata passed from the client
      ...(metadata && typeof metadata === 'object' ? {
        userEmail: metadata.userEmail,
        userName: metadata.userName
      } : {})
    };

    console.log('📋 Enhanced metadata prepared with user context:', {
      projectId,
      userId: userId || 'NOT_PROVIDED',
      isCommunityProject: true,
      metadataSize: JSON.stringify(enhancedMetadata).length,
      note: 'Including userId and essential user context for agent'
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