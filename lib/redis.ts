import { Redis } from 'ioredis';

class RedisClient {
  private static instance: Redis | null = null;
  private static isConnecting = false;

  static async getInstance(): Promise<Redis> {
    if (this.instance && this.instance.status === 'ready') {
      return this.instance;
    }

    if (this.isConnecting) {
      // Wait for the connection to complete
      while (this.isConnecting) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (this.instance) return this.instance;
    }

    this.isConnecting = true;

    try {
      const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
      
      if (!redisUrl) {
        console.warn('⚠️ No Redis URL found in environment variables. Redis caching will be disabled.');
        this.isConnecting = false;
        // Return a mock Redis client that does nothing
        return this.createMockClient();
      }

      // Parse Redis URL to extract connection details
      const url = new URL(redisUrl);
      
      this.instance = new Redis({
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password,
        username: url.username || undefined,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        // Additional options for cloud Redis services
        tls: url.protocol === 'rediss:' ? {} : undefined,
        connectTimeout: 10000,
        commandTimeout: 5000,
      });

      // Handle connection events
      this.instance.on('connect', () => {
        console.log('✅ Redis connected successfully');
      });

      this.instance.on('error', (err) => {
        console.error('❌ Redis connection error:', err.message);
      });

      this.instance.on('close', () => {
        console.log('🔌 Redis connection closed');
      });

      this.instance.on('reconnecting', () => {
        console.log('🔄 Redis reconnecting...');
      });

      // Test the connection
      await this.instance.ping();
      console.log('🏓 Redis ping successful');

      this.isConnecting = false;
      return this.instance;
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      this.isConnecting = false;
      // Return mock client on connection failure
      return this.createMockClient();
    }
  }

  private static createMockClient(): Redis {
    console.log('🎭 Creating mock Redis client (Redis unavailable)');
    return {
      get: async () => null,
      set: async () => 'OK',
      setex: async () => 'OK',
      del: async () => 1,
      expire: async () => 1,
      exists: async () => 0,
      ping: async () => 'PONG',
      flushall: async () => 'OK',
      keys: async () => [],
      ttl: async () => -1,
      hget: async () => null,
      hset: async () => 1,
      hdel: async () => 1,
      hgetall: async () => ({}),
      sadd: async () => 1,
      smembers: async () => [],
      srem: async () => 1,
      status: 'ready',
      disconnect: async () => undefined,
    } as any;
  }

  static async disconnect(): Promise<void> {
    if (this.instance) {
      await this.instance.disconnect();
      this.instance = null;
    }
  }
}

// Cache helper functions
export class CacheManager {
  private redis: Redis | null = null;

  async getClient(): Promise<Redis> {
    if (!this.redis) {
      this.redis = await RedisClient.getInstance();
    }
    return this.redis;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const client = await this.getClient();
      const value = await client.get(key);
      
      if (!value) return null;
      
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`❌ Redis GET error for key "${key}":`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, expirationSeconds?: number): Promise<boolean> {
    try {
      const client = await this.getClient();
      const serializedValue = JSON.stringify(value);
      
      if (expirationSeconds) {
        await client.setex(key, expirationSeconds, serializedValue);
      } else {
        await client.set(key, serializedValue);
      }
      
      console.log(`✅ Cached data for key "${key}"${expirationSeconds ? ` (expires in ${expirationSeconds}s)` : ''}`);
      return true;
    } catch (error) {
      console.error(`❌ Redis SET error for key "${key}":`, error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      const client = await this.getClient();
      await client.del(key);
      console.log(`🗑️ Deleted cache key "${key}"`);
      return true;
    } catch (error) {
      console.error(`❌ Redis DEL error for key "${key}":`, error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const client = await this.getClient();
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`❌ Redis EXISTS error for key "${key}":`, error);
      return false;
    }
  }

  async flush(): Promise<boolean> {
    try {
      const client = await this.getClient();
      await client.flushall();
      console.log('🧹 Flushed all Redis cache');
      return true;
    } catch (error) {
      console.error('❌ Redis FLUSH error:', error);
      return false;
    }
  }

  // Cache with automatic key generation
  async cacheApiResponse<T>(
    apiIdentifier: string,
    params: Record<string, any>,
    dataFetcher: () => Promise<T>,
    expirationSeconds: number = 300 // 5 minutes default
  ): Promise<T> {
    // Generate cache key
    const paramsString = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');
    const cacheKey = `api:${apiIdentifier}:${Buffer.from(paramsString).toString('base64')}`;

    // Try to get from cache first
    const cachedData = await this.get<T>(cacheKey);
    if (cachedData) {
      console.log(`🎯 Cache HIT for "${apiIdentifier}"`);
      return cachedData;
    }

    // Not in cache, fetch fresh data
    console.log(`🔄 Cache MISS for "${apiIdentifier}" - fetching fresh data`);
    const freshData = await dataFetcher();

    // Cache the fresh data
    await this.set(cacheKey, freshData, expirationSeconds);

    return freshData;
  }
}

// Global cache manager instance
export const cache = new CacheManager();

// Export Redis instance getter for direct access if needed
export const getRedisClient = () => RedisClient.getInstance(); 