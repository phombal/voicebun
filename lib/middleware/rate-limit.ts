import { NextRequest, NextResponse } from 'next/server';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

// In-memory store for rate limiting (use Redis in production for multiple instances)
const store: RateLimitStore = {};

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  message?: string; // Custom error message
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

export function createRateLimit(options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    message = 'Too many requests, please try again later.',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  return async function rateLimit(
    request: NextRequest,
    getResponse: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    // Get client identifier (IP address + user agent for better uniqueness)
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : request.ip || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const key = `${ip}:${userAgent}`;

    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries
    Object.keys(store).forEach(storeKey => {
      if (store[storeKey].resetTime < windowStart) {
        delete store[storeKey];
      }
    });

    // Get or create entry for this client
    if (!store[key]) {
      store[key] = {
        count: 0,
        resetTime: now + windowMs,
      };
    }

    const clientData = store[key];

    // Reset if window has passed
    if (now > clientData.resetTime) {
      clientData.count = 0;
      clientData.resetTime = now + windowMs;
    }

    // Check if limit exceeded
    if (clientData.count >= maxRequests) {
      const resetTimeSeconds = Math.ceil((clientData.resetTime - now) / 1000);
      
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message,
          retryAfter: resetTimeSeconds,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': clientData.resetTime.toString(),
            'Retry-After': resetTimeSeconds.toString(),
          },
        }
      );
    }

    // Increment counter (before processing request)
    if (!skipSuccessfulRequests && !skipFailedRequests) {
      clientData.count++;
    }

    // Process the request
    const response = await getResponse();

    // Conditionally count based on response status
    if (skipSuccessfulRequests || skipFailedRequests) {
      const isSuccess = response.status >= 200 && response.status < 300;
      const shouldCount = 
        (!skipSuccessfulRequests || !isSuccess) &&
        (!skipFailedRequests || isSuccess);
      
      if (shouldCount) {
        clientData.count++;
      }
    }

    // Add rate limit headers to response
    const remaining = Math.max(0, maxRequests - clientData.count);
    response.headers.set('X-RateLimit-Limit', maxRequests.toString());
    response.headers.set('X-RateLimit-Remaining', remaining.toString());
    response.headers.set('X-RateLimit-Reset', clientData.resetTime.toString());

    return response;
  };
}

// Predefined rate limiters for common use cases
export const strictRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10, // 10 requests per 15 minutes
  message: 'Too many requests from this IP, please try again later.',
});

export const moderateRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100, // 100 requests per 15 minutes
  message: 'Rate limit exceeded, please slow down.',
});

export const lenientRateLimit = createRateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  maxRequests: 60, // 60 requests per minute
  message: 'Too many requests, please wait a moment.',
});

// Special rate limiter for expensive operations
export const expensiveOperationLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5, // 5 requests per hour
  message: 'This operation is rate limited. Please try again later.',
}); 