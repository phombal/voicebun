import { NextRequest, NextResponse } from 'next/server';
import { autoTagProject } from '@/lib/auto-tagger';
import { CacheManager } from '@/lib/redis';
import crypto from 'crypto';

const cacheManager = new CacheManager();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { systemPrompt, title, description, publicDescription } = body;

    if (!systemPrompt) {
      return NextResponse.json(
        { error: 'System prompt is required for auto-tagging' },
        { status: 400 }
      );
    }

    // Create a hash of the input content for caching
    const contentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ systemPrompt, title, description, publicDescription }))
      .digest('hex');
    
    const cacheKey = `api:auto-tag:${contentHash}`;
    
    // Check cache first
    const cached = await cacheManager.get(cacheKey);
    if (cached) {
      console.log('✅ Returning cached auto-tag result');
      return NextResponse.json(cached);
    }

    console.log('🏷️ Auto-tagging request received for project:', title || 'Untitled');
    console.log('🏷️ Request data - systemPrompt length:', systemPrompt?.length || 0);
    console.log('🏷️ Request data - title:', title || 'undefined');
    console.log('🏷️ Request data - description:', description || 'undefined');
    console.log('🏷️ Request data - publicDescription:', publicDescription || 'undefined');

    const category = await autoTagProject({
      systemPrompt,
      title,
      description,
      publicDescription
    });

    console.log('🏷️ Auto-tagging result from autoTagProject function:', category);
    console.log('🏷️ Category type:', typeof category);
    console.log('🏷️ Category is null?', category === null);
    console.log('🏷️ Category is undefined?', category === undefined);

    // Ensure we return a valid category or 'other' as fallback
    const finalCategory = category || 'other';
    console.log('🏷️ Final category being returned:', finalCategory);

    const result = {
      success: true,
      category: finalCategory
    };

    // Cache for 24 hours (86400 seconds) since same content should always get same category
    await cacheManager.set(cacheKey, result, 86400);
    console.log('📦 Cached auto-tag result for 24 hours');

    return NextResponse.json(result);

  } catch (error) {
    console.error('❌ Auto-tagging API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to auto-tag project',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 