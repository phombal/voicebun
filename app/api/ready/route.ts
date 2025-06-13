import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Simple readiness check - just return OK if the service is running
  // This is typically used by load balancers and orchestrators
  return NextResponse.json(
    {
      status: 'ready',
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
} 