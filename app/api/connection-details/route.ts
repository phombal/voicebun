import { AccessToken, AccessTokenOptions, VideoGrant } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

// NOTE: you are expected to define the following environment variables in `.env.local`:
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

// don't cache the results
export const revalidate = 0;

export type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
};

type RoomMetadata = {
  agentConfig?: unknown;
  generatedCode?: string;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    if (LIVEKIT_URL === undefined) {
      throw new Error("LIVEKIT_URL is not defined");
    }
    if (API_KEY === undefined) {
      throw new Error("LIVEKIT_API_KEY is not defined");
    }
    if (API_SECRET === undefined) {
      throw new Error("LIVEKIT_API_SECRET is not defined");
    }

    const url = new URL(request.url);
    
    // Extract project ID and other parameters
    const projectId = url.searchParams.get('projectId');
    const userId = url.searchParams.get('userId');
    const agentConfigParam = url.searchParams.get('agentConfig');
    const generatedCode = url.searchParams.get('generatedCode');
    
    // Validate project ID
    if (!projectId) {
      throw new Error("Project ID is required");
    }
    
    let agentConfig = null;
    if (agentConfigParam) {
      try {
        agentConfig = JSON.parse(agentConfigParam);
      } catch (e) {
        console.error('Failed to parse agent config:', e);
      }
    }

    // Generate participant token
    const participantIdentity = userId ? `user_${userId}` : `user_${Math.floor(Math.random() * 10_000)}`;
    // Use a generic room name since project ID will be passed in participant metadata
    const roomName = `voice_agent_room_${Math.floor(Math.random() * 10_000)}`;
    
    // Create room metadata with agent configuration (for backwards compatibility)
    const roomMetadata: RoomMetadata = {};
    if (agentConfig) {
      roomMetadata.agentConfig = agentConfig;
    }
    if (generatedCode) {
      roomMetadata.generatedCode = generatedCode;
    }

    const participantToken = await createParticipantToken(
      { identity: participantIdentity },
      roomName,
      roomMetadata
    );

    // Return connection details
    const connectionDetails: ConnectionDetails = {
      serverUrl: LIVEKIT_URL,
      roomName,
      participantToken: participantToken,
      participantName: participantIdentity,
    };

    console.log('Generated connection details for dynamic agent:', {
      projectId,
      userId,
      roomName,
      participantName: participantIdentity,
      note: 'Project ID and User ID will be passed via participant metadata',
      hasConfig: !!agentConfig,
      hasGeneratedCode: !!generatedCode,
      configKeys: agentConfig ? Object.keys(agentConfig) : [],
      codeLength: generatedCode?.length || 0
    });

    const headers = new Headers({
      "Cache-Control": "no-store",
    });
    return NextResponse.json(connectionDetails, { headers });
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
      return new NextResponse(error.message, { status: 500 });
    }
    return new NextResponse("Unknown error occurred", { status: 500 });
  }
}

function createParticipantToken(userInfo: AccessTokenOptions, roomName: string, roomMetadata?: RoomMetadata) {
  const at = new AccessToken(API_KEY, API_SECRET, {
    ...userInfo,
    ttl: "15m",
  });
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
    canUpdateOwnMetadata: true,
    roomCreate: true,
    ...(roomMetadata && { metadata: JSON.stringify(roomMetadata) })
  };
  at.addGrant(grant);
  return at.toJwt();
}
