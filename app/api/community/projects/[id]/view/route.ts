import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Await the params in Next.js 14+
    const { id } = await params;
    const projectId = id;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // First get the current view count
    const { data: currentProject, error: fetchError } = await supabase
      .from('projects')
      .select('view_count')
      .eq('id', projectId)
      .eq('visibility', 'public') // Only increment for public projects
      .single();

    if (fetchError) {
      console.error('Error fetching current project:', fetchError);
      return NextResponse.json(
        { error: 'Project not found or not public' },
        { status: 404 }
      );
    }

    const newViewCount = (currentProject.view_count || 0) + 1;

    // Increment the view count for community projects
    const { data, error } = await supabase
      .from('projects')
      .update({ 
        view_count: newViewCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', projectId)
      .eq('visibility', 'public') // Only increment for public projects
      .select('view_count')
      .single();

    if (error) {
      console.error('Error incrementing community project view count:', error);
      return NextResponse.json(
        { error: 'Failed to increment view count' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      view_count: data?.view_count || newViewCount
    });

  } catch (error) {
    console.error('Error in community project view count API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 