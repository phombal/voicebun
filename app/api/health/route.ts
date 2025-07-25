import { NextResponse } from 'next/server';
import { supabaseServiceRole } from '@/lib/database/server';
import { cache } from '@/lib/redis';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: {
      status: 'healthy' | 'unhealthy' | 'degraded';
      responseTime?: number;
      error?: string;
    };
    environment: {
      status: 'healthy' | 'unhealthy' | 'degraded';
      missing?: string[];
    };
    memory: {
      status: 'healthy' | 'unhealthy' | 'degraded';
      usage?: {
        used: number;
        total: number;
        percentage: number;
      };
    };
  };
}

// Required environment variables for production
const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'TELNYX_API_KEY',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'OPENAI_API_KEY',
];

async function checkDatabase(): Promise<HealthCheck['checks']['database']> {
  const startTime = Date.now();
  
  try {
    // Simple query to check database connectivity
    const { error } = await supabaseServiceRole
      .from('users')
      .select('id')
      .limit(1);
    
    const responseTime = Date.now() - startTime;
    
    if (error) {
      return {
        status: 'unhealthy',
        responseTime,
        error: error.message,
      };
    }
    
    return {
      status: 'healthy',
      responseTime,
    };
  } catch (error: any) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error.message || 'Unknown database error',
    };
  }
}

function checkEnvironment(): HealthCheck['checks']['environment'] {
  const missing: string[] = [];
  
  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }
  
  return {
    status: missing.length === 0 ? 'healthy' : 'unhealthy',
    missing: missing.length > 0 ? missing : undefined,
  };
}

function checkMemory(): HealthCheck['checks']['memory'] {
  try {
    const memoryUsage = process.memoryUsage();
    const totalMemory = memoryUsage.heapTotal;
    const usedMemory = memoryUsage.heapUsed;
    const percentage = (usedMemory / totalMemory) * 100;
    
    return {
      status: percentage > 90 ? 'unhealthy' : 'healthy',
      usage: {
        used: Math.round(usedMemory / 1024 / 1024), // MB
        total: Math.round(totalMemory / 1024 / 1024), // MB
        percentage: Math.round(percentage),
      },
    };
  } catch {
    return {
      status: 'unhealthy',
    };
  }
}

export async function GET() {
  try {
    // Use caching for health check to reduce database load
    const healthCheck = await cache.cacheApiResponse(
      'health-check',
      {}, // No parameters for health check
      async () => {
        // Run all health checks in parallel
        const [databaseCheck, environmentCheck, memoryCheck] = await Promise.all([
          checkDatabase(),
          Promise.resolve(checkEnvironment()),
          Promise.resolve(checkMemory()),
        ]);
        
        // Determine overall status
        const checks = {
          database: databaseCheck,
          environment: environmentCheck,
          memory: memoryCheck,
        };
        
        const hasUnhealthy = Object.values(checks).some(check => check.status === 'unhealthy');
        const hasDegraded = Object.values(checks).some(check => check.status === 'degraded');
        
        let overallStatus: HealthCheck['status'] = 'healthy';
        if (hasUnhealthy) {
          overallStatus = 'unhealthy';
        } else if (hasDegraded) {
          overallStatus = 'degraded';
        }
        
        return {
          status: overallStatus,
          timestamp: new Date().toISOString(),
          version: process.env.npm_package_version || '1.0.0',
          uptime: process.uptime(),
          checks,
        };
      },
      30 // Cache for 30 seconds only (health checks should be fairly fresh)
    );
    
    // Return appropriate HTTP status code
    const statusCode = healthCheck.status === 'healthy' ? 200 : 
                      healthCheck.status === 'degraded' ? 200 : 503;
    
    return NextResponse.json(healthCheck, { status: statusCode });
    
  } catch (error) {
    console.error('Health check error:', error);
    
    const healthCheck: HealthCheck = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      checks: {
        database: { status: 'unhealthy', error: 'Health check failed' },
        environment: { status: 'unhealthy' },
        memory: { status: 'unhealthy' },
      },
    };
    
    return NextResponse.json(healthCheck, { status: 503 });
  }
} 