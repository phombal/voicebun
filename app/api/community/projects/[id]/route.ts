import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await the params in Next.js 14+
    const { id } = await params;
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const projectId = id;

    // Get the specific public project with its project data
    const { data: project, error } = await supabase
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
          llm_model,
          llm_provider,
          stt_provider,
          stt_language,
          phone_number
        )
      `)
      .eq('id', projectId)
      .eq('visibility', 'public')
      .eq('status', 'active')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      console.error('Error fetching project:', error);
      return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
    }

    // Get user information for the project
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
    
    let userName = 'Anonymous';
    let userEmail = '';
    
    if (!usersError && users) {
      const user = users.users.find((u: { id: string }) => u.id === project.user_id);
      if (user) {
        userName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Anonymous';
        userEmail = user.email || '';
      }
    }

    // Combine project data with user information
    const enrichedProject = {
      ...project,
      user_name: userName,
      user_email: userEmail,
      project_data: project.project_data?.[0] || null // project_data is an array, get first item
    };

    return NextResponse.json({
      success: true,
      project: enrichedProject
    });

  } catch (error) {
    console.error('Community project detail API error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 