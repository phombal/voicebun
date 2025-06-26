import { NextRequest, NextResponse } from 'next/server';
import { cache, getRedisClient } from '@/lib/redis';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const key = searchParams.get('key');

  try {
    switch (action) {
      case 'health':
        // Check Redis connection health
        const client = await getRedisClient();
        const pingResult = await client.ping();
        return NextResponse.json({
          status: 'healthy',
          redis: {
            connected: true,
            ping: pingResult,
            status: client.status
          }
        });

      case 'keys':
        // List all cache keys (be careful in production!)
        const redis = await getRedisClient();
        const keys = await redis.keys('*');
        return NextResponse.json({
          keys: keys,
          count: keys.length
        });

      case 'get':
        // Get a specific cache key
        if (!key) {
          return NextResponse.json({ error: 'Key parameter required' }, { status: 400 });
        }
        const value = await cache.get(key);
        return NextResponse.json({
          key,
          value,
          exists: value !== null
        });

      case 'exists':
        // Check if a key exists
        if (!key) {
          return NextResponse.json({ error: 'Key parameter required' }, { status: 400 });
        }
        const exists = await cache.exists(key);
        return NextResponse.json({
          key,
          exists
        });

      case 'stats':
        // Get cache statistics
        const redisClient = await getRedisClient();
        const info = await redisClient.info('memory');
        const keyCount = await redisClient.dbsize();
        
        return NextResponse.json({
          keyCount,
          memoryInfo: info,
          serverInfo: {
            status: redisClient.status
          }
        });

      default:
        return NextResponse.json({
          availableActions: [
            'health - Check Redis connection',
            'keys - List all cache keys',
            'get?key=xxx - Get specific key value',
            'exists?key=xxx - Check if key exists',
            'stats - Get cache statistics'
          ]
        });
    }
  } catch (error: any) {
    console.error('Cache API error:', error);
    return NextResponse.json(
      { 
        error: 'Cache operation failed',
        message: error.message,
        action 
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const key = searchParams.get('key');

  try {
    switch (action) {
      case 'flush':
        // Clear all cache (use with caution!)
        const success = await cache.flush();
        return NextResponse.json({
          action: 'flush',
          success,
          message: success ? 'All cache cleared' : 'Failed to clear cache'
        });

      case 'delete':
        // Delete a specific key
        if (!key) {
          return NextResponse.json({ error: 'Key parameter required' }, { status: 400 });
        }
        const deleted = await cache.del(key);
        return NextResponse.json({
          action: 'delete',
          key,
          success: deleted,
          message: deleted ? 'Key deleted' : 'Key not found or failed to delete'
        });

      default:
        return NextResponse.json({
          availableActions: [
            'flush - Clear all cache (DELETE method)',
            'delete?key=xxx - Delete specific key (DELETE method)'
          ]
        });
    }
  } catch (error: any) {
    console.error('Cache DELETE error:', error);
    return NextResponse.json(
      { 
        error: 'Cache delete operation failed',
        message: error.message,
        action 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value, expiration } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { error: 'Key and value are required' },
        { status: 400 }
      );
    }

    const success = await cache.set(key, value, expiration);
    
    return NextResponse.json({
      action: 'set',
      key,
      success,
      expiration: expiration || null,
      message: success ? 'Key set successfully' : 'Failed to set key'
    });
  } catch (error: any) {
    console.error('Cache POST error:', error);
    return NextResponse.json(
      { 
        error: 'Cache set operation failed',
        message: error.message
      },
      { status: 500 }
    );
  }
} 