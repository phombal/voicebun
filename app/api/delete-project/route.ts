import { NextRequest, NextResponse } from 'next/server';
import { supabaseServiceRole } from '@/lib/database/server';
import { SipClient } from 'livekit-server-sdk';

interface DeleteProjectRequest {
  projectId: string;
  userId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: DeleteProjectRequest = await request.json();
    console.log('🗑️ Deleting project:', {
      projectId: body.projectId,
      userId: body.userId
    });

    // First verify the project belongs to the user
    const { data: project } = await supabaseServiceRole
      .from('projects')
      .select('*')
      .eq('id', body.projectId)
      .eq('user_id', body.userId)
      .single();
    
    if (!project) {
      return NextResponse.json({
        success: false,
        error: 'Project not found or unauthorized'
      }, { status: 404 });
    }

    console.log('📋 Found project:', project.name);

    // Get all phone numbers assigned to this project
    const { data: projectPhoneNumbers } = await supabaseServiceRole
      .from('phone_numbers')
      .select('*')
      .eq('project_id', body.projectId)
      .eq('is_active', true);
    
    console.log(`📞 Found ${projectPhoneNumbers?.length || 0} phone numbers to unassign`);

    // Unassign all phone numbers and clean up LiveKit resources
    if (projectPhoneNumbers && projectPhoneNumbers.length > 0) {
      // Initialize LiveKit SIP client for cleanup
      const LIVEKIT_URL = process.env.LIVEKIT_URL;
      const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
      const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

      let sipClient: SipClient | null = null;
      if (LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET) {
        sipClient = new SipClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
      } else {
        console.warn('⚠️ LiveKit environment variables not configured, skipping LiveKit cleanup');
      }

      for (const phoneNumber of projectPhoneNumbers) {
        try {
          console.log(`📞 Unassigning and cleaning up phone number ${phoneNumber.phone_number}`);
          
          // Update database to unassign
          await supabaseServiceRole
            .from('phone_numbers')
            .update({
              status: 'active',
              project_id: null,
              voice_agent_enabled: false,
              updated_at: new Date().toISOString()
            })
            .eq('id', phoneNumber.id);

          // Clean up LiveKit resources if client is available
          if (sipClient) {
            try {
              // Clean up dispatch rules
              const dispatchRules = await sipClient.listSipDispatchRule();
              const targetDispatchRules = dispatchRules.filter((rule: any) => {
                return (
                  (rule.name && rule.name.includes(phoneNumber.phone_number)) ||
                  (rule.attributes && rule.attributes['phone_number'] === phoneNumber.phone_number) ||
                  (phoneNumber.dispatch_rule_id && rule.sipDispatchRuleId === phoneNumber.dispatch_rule_id)
                );
              });

              for (const dispatchRule of targetDispatchRules) {
                try {
                  console.log(`🎯 Deleting dispatch rule: ${dispatchRule.sipDispatchRuleId}`);
                  await sipClient.deleteSipDispatchRule(dispatchRule.sipDispatchRuleId);
                  console.log('✅ Dispatch rule deleted successfully');
                } catch (deleteError) {
                  console.error(`⚠️ Failed to delete dispatch rule:`, deleteError);
                }
              }

              // Clean up inbound trunk
              const trunks = await sipClient.listSipInboundTrunk();
              const targetTrunk = trunks.find((trunk: any) => 
                trunk.numbers && trunk.numbers.includes(phoneNumber.phone_number)
              );

              if (targetTrunk) {
                try {
                  console.log(`🎯 Deleting trunk: ${targetTrunk.sipTrunkId}`);
                  await sipClient.deleteSipTrunk(targetTrunk.sipTrunkId);
                  console.log('✅ Trunk deleted successfully');
                } catch (deleteError) {
                  console.error(`⚠️ Failed to delete trunk:`, deleteError);
                }
              }
            } catch (livekitError) {
              console.error(`⚠️ LiveKit cleanup error for ${phoneNumber.phone_number}:`, livekitError);
            }
          }
          
          console.log(`✅ Successfully unassigned phone number ${phoneNumber.phone_number}`);
        } catch (error) {
          console.error(`⚠️ Error unassigning phone number ${phoneNumber.phone_number}:`, error);
          // Continue with other phone numbers even if one fails
        }
      }
    }

    // Delete all project_data entries for this project
    console.log('🗑️ Deleting project_data entries...');
    const { error: projectDataError } = await supabaseServiceRole
      .from('project_data')
      .delete()
      .eq('project_id', body.projectId);
    
    if (projectDataError) {
      console.error('❌ Failed to delete project_data:', projectDataError);
      throw projectDataError;
    }

    // Delete the project itself
    console.log('🗑️ Deleting project...');
    const { error: projectError } = await supabaseServiceRole
      .from('projects')
      .delete()
      .eq('id', body.projectId);
    
    if (projectError) {
      console.error('❌ Failed to delete project:', projectError);
      throw projectError;
    }

    console.log('✅ Project deleted successfully');

    return NextResponse.json({
      success: true,
      message: 'Project deleted successfully',
      data: {
        projectId: body.projectId,
        projectName: project.name,
        phoneNumbersUnassigned: projectPhoneNumbers?.length || 0
      }
    });

  } catch (error: any) {
    console.error('❌ Project deletion error:', error);
    return NextResponse.json({
      success: false,
      error: 'Project deletion failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
} 
 