import { NextRequest, NextResponse } from 'next/server';
import { autoTagProject, type ProjectCategory } from '@/lib/auto-tagger';

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

    return NextResponse.json({
      success: true,
      category: finalCategory
    });

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