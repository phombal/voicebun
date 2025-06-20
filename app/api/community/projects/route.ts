import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get public projects with their associated project data and user information
    const { data: projects, error } = await supabase
      .from('projects')
      .select(`
        id,
        name,
        description,
        created_at,
        user_id,
        project_data (
          public_title,
          public_description,
          public_welcome_message,
          project_emoji,
          project_photo,
          system_prompt,
          tts_provider,
          tts_voice,
          llm_model
        )
      `)
      .eq('visibility', 'public')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching public projects:', error);
      return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
    }

    // Get user information for each project
    const userIds = Array.from(new Set(projects?.map(p => p.user_id) || []));
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
    
    if (usersError) {
      console.error('Error fetching users:', usersError);
    }

    // Create a map of user IDs to user info
    const userMap = new Map();
    if (users) {
      users.users.forEach(user => {
        userMap.set(user.id, {
          name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Anonymous',
          email: user.email
        });
      });
    }

    // Combine project data with user information
    const enrichedProjects = projects?.map(project => ({
      ...project,
      user_name: userMap.get(project.user_id)?.name || 'Anonymous',
      user_email: userMap.get(project.user_id)?.email || '',
      project_data: project.project_data?.[0] || null // project_data is an array, get first item
    })) || [];

    return NextResponse.json({
      success: true,
      projects: enrichedProjects,
      total: enrichedProjects.length
    });

  } catch (error) {
    console.error('Community projects API error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 