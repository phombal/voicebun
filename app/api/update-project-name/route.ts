import { NextRequest, NextResponse } from 'next/server';
import { supabaseServiceRole } from '@/lib/database/server';

export async function POST(request: NextRequest) {
  try {
    if (!supabaseServiceRole) {
      console.error('❌ Service role client not available');
      return NextResponse.json({ error: 'Service not available' }, { status: 500 });
    }

    const { projectId, projectName, userId } = await request.json();

    if (!projectId || !projectName || !userId) {
      return NextResponse.json({ error: 'Project ID, name, and user ID are required' }, { status: 400 });
    }

    // Update the project name in the projects table
    const { error: projectError } = await supabaseServiceRole
      .from('projects')
      .update({ 
        name: projectName.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('id', projectId)
      .eq('user_id', userId);

    if (projectError) {
      console.error('Error updating project name in projects table:', projectError);
      return NextResponse.json({ error: 'Failed to update project name' }, { status: 500 });
    }

    // Also update the project_data table if it has a project_name field
    const { error: dataError } = await supabaseServiceRole
      .from('project_data')
      .update({ 
        project_name: projectName.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('project_id', projectId);

    if (dataError) {
      console.error('Error updating project name in project_data table:', dataError);
      // Don't return error here since the main projects table was updated successfully
      // This is just to keep them in sync
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Project name updated successfully' 
    });

  } catch (error) {
    console.error('Error updating project name:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 