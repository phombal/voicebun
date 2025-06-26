import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CacheManager } from '@/lib/redis';

const cacheManager = new CacheManager();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Check cache first - use user-specific cache key
    const cacheKey = `api:user-projects:${userId}`;
    const cached = await cacheManager.get(cacheKey);
    
    if (cached) {
      console.log('✅ Returning cached user projects for user:', userId);
      return NextResponse.json(cached);
    }

    console.log('🔍 Fetching user projects from database for user:', userId);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get user's projects with their associated project data
    const { data: projects, error } = await supabase
      .from('projects')
      .select(`
        id,
        name,
        description,
        created_at,
        last_accessed_at,
        initial_prompt,
        config,
        view_count,
        project_emoji,
        category,
        visibility,
        status,
        project_data (
          public_title,
          public_description,
          system_prompt,
          project_emoji,
          category,
          llm_model,
          tts_provider,
          tts_voice
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching user projects:', error);
      return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
    }

    // Process projects data
    const processedProjects = projects?.map(project => ({
      ...project,
      description: project.description || undefined,
      project_data: project.project_data?.[0] || null // project_data is an array, get first item
    })) || [];

    const result = {
      success: true,
      projects: processedProjects,
      total: processedProjects.length,
      userId
    };

    // Cache for 5 minutes (300 seconds) - shorter than community projects since user data changes more frequently
    await cacheManager.set(cacheKey, result, 300);
    console.log(`📦 Cached user projects for user ${userId} for 5 minutes`);

    return NextResponse.json(result);

  } catch (error) {
    console.error('User projects API error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST endpoint to invalidate cache when projects are created/updated/deleted
export async function POST(request: Request) {
  try {
    const { userId, action } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Invalidate the user's projects cache
    const cacheKey = `api:user-projects:${userId}`;
    await cacheManager.del(cacheKey);
    
    console.log(`🗑️ Invalidated user projects cache for user ${userId} due to ${action || 'unknown action'}`);

    return NextResponse.json({ 
      success: true, 
      message: 'Cache invalidated',
      userId,
      action
    });

  } catch (error) {
    console.error('User projects cache invalidation error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 