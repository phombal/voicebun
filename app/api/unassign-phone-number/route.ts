import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/service';
import { supabaseServiceRole } from '@/lib/database/auth';
import { SipClient } from 'livekit-server-sdk';

interface UnassignPhoneNumberRequest {
  phoneNumberId: string;
  projectId: string;
  userId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: UnassignPhoneNumberRequest = await request.json();
    console.log('📞 Unassigning phone number from project:', {
      phoneNumberId: body.phoneNumberId,
      projectId: body.projectId,
      userId: body.userId
    });

    // Get the phone number details using service role to bypass RLS
    const { data: phoneNumber, error: phoneError } = await supabaseServiceRole
      .from('phone_numbers')
      .select('*')
      .eq('id', body.phoneNumberId)
      .eq('user_id', body.userId) // Ensure user owns the phone number
      .single();

    if (phoneError || !phoneNumber) {
      console.error('❌ Phone number not found:', phoneError);
      return NextResponse.json({
        success: false,
        error: 'Phone Number Not Found',
        details: 'The specified phone number could not be found'
      }, { status: 404 });
    }

    console.log('📱 Found phone number:', phoneNumber.phone_number);

    // Check if phone number is already unassigned (and no cleanup needed)
    if (!phoneNumber.project_id && phoneNumber.status === 'active') {
      console.log('ℹ️ Phone number is already unassigned and clean');
      return NextResponse.json({
        success: true,
        message: 'Phone number is already unassigned',
        data: {
          phoneNumber: phoneNumber.phone_number,
          status: phoneNumber.status,
          projectId: phoneNumber.project_id
        }
      });
    }

    // If project_id exists, verify it matches the request (for safety)
    if (phoneNumber.project_id && phoneNumber.project_id !== body.projectId) {
      console.log(`⚠️ Project ID mismatch: DB has ${phoneNumber.project_id}, request has ${body.projectId}`);
      return NextResponse.json({
        success: false,
        error: 'Invalid Assignment',
        details: 'This phone number is not assigned to the specified project'
      }, { status: 400 });
    }

    // Update database to unassign the phone number using service role
    console.log('💾 Updating database to unassign phone number...');
    
    try {
      const { error: updateError } = await supabaseServiceRole
        .from('phone_numbers')
        .update({
          status: 'active',
          project_id: null, // Remove project association
          voice_agent_enabled: false, // Disable voice agent
          updated_at: new Date().toISOString()
        })
        .eq('id', body.phoneNumberId)
        .eq('user_id', body.userId); // Ensure user owns the phone number

      if (updateError) {
        console.error('❌ Database update failed:', updateError);
        return NextResponse.json({
          success: false,
          error: 'Database Update Failed',
          details: 'Failed to update phone number status in database'
        }, { status: 500 });
      }
      console.log('✅ Database updated successfully');
    } catch (dbError) {
      console.error('❌ Database update failed:', dbError);
      return NextResponse.json({
        success: false,
        error: 'Database Update Failed',
        details: 'Failed to update phone number status in database'
      }, { status: 500 });
    }

    // Step 3: Clean up LiveKit dispatch rules and inbound trunk using SDK
    console.log('🗑️ Cleaning up LiveKit dispatch rules and inbound trunk...');
    
    // Initialize LiveKit SIP client
    const LIVEKIT_URL = process.env.LIVEKIT_URL;
    const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
    const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      console.error('❌ LiveKit environment variables not configured');
      return NextResponse.json({
        success: false,
        error: 'LiveKit Configuration Missing',
        details: 'LiveKit environment variables are not properly configured'
      }, { status: 500 });
    }

    const sipClient = new SipClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    
    let dispatchRulesDeleted = 0;
    let trunkDeleted = false;
    
    // Step 3a: Delete dispatch rules first (they depend on trunks)
    try {
      console.log('📋 Listing existing dispatch rules...');
      const dispatchRules = await sipClient.listSipDispatchRule();
      
      // Find dispatch rules using multiple methods:
      // 1. Check if we have a stored dispatch rule ID and it exists
      // 2. Search by name containing the phone number
      // 3. Search by metadata containing the phone number
      const targetDispatchRules: any[] = [];
      
      // Method 1: Check stored dispatch rule ID
      if (phoneNumber.dispatch_rule_id) {
        console.log(`🔍 Checking stored dispatch rule ID: ${phoneNumber.dispatch_rule_id}`);
        const storedRule = dispatchRules.find((rule: any) => 
          rule.sipDispatchRuleId === phoneNumber.dispatch_rule_id
        );
        
        if (storedRule) {
          console.log('✅ Found dispatch rule using stored ID');
          targetDispatchRules.push(storedRule);
        } else {
          console.log('⚠️ Stored dispatch rule ID not found, searching by other methods...');
        }
      }
      
      // Method 2 & 3: Search by name, attributes, and metadata
      const additionalRules = dispatchRules.filter((rule: any) => {
        // Skip if already found by stored ID
        if (targetDispatchRules.some(existingRule => existingRule.sipDispatchRuleId === rule.sipDispatchRuleId)) {
          return false;
        }
        
        // Check name
        if (rule.name && rule.name.includes(phoneNumber.phone_number)) {
          return true;
        }
        
        // Check attributes
        if (rule.attributes && rule.attributes['phone_number'] === phoneNumber.phone_number) {
          return true;
        }
        
        // Check metadata
        if (rule.metadata) {
          try {
            const metadata = JSON.parse(rule.metadata);
            if (metadata.phoneNumber === phoneNumber.phone_number) {
              return true;
            }
          } catch (e) {
            // Ignore JSON parse errors
          }
        }
        
        return false;
      });
      
      targetDispatchRules.push(...additionalRules);
      
      console.log(`📋 Found ${targetDispatchRules.length} dispatch rule(s) for ${phoneNumber.phone_number}`);
      
      for (const dispatchRule of targetDispatchRules) {
        try {
          console.log(`🎯 Deleting dispatch rule: ${dispatchRule.sipDispatchRuleId} (${dispatchRule.name})`);
          await sipClient.deleteSipDispatchRule(dispatchRule.sipDispatchRuleId);
          console.log('✅ Dispatch rule deleted successfully');
          dispatchRulesDeleted++;
        } catch (deleteError) {
          console.error(`⚠️ Failed to delete dispatch rule ${dispatchRule.sipDispatchRuleId}:`, deleteError);
        }
      }
      
    } catch (dispatchError) {
      console.error('⚠️ Failed to list/delete dispatch rules:', dispatchError);
    }
    
    // Step 3b: Delete the inbound trunk
    try {
      console.log('📋 Listing existing LiveKit trunks...');
      const trunks = await sipClient.listSipInboundTrunk();
      
      // Find trunk that contains this phone number
      const targetTrunk = trunks.find((trunk: any) => 
        trunk.numbers && trunk.numbers.includes(phoneNumber.phone_number)
      );
      
      if (targetTrunk) {
        console.log(`🎯 Found trunk to delete: ${targetTrunk.sipTrunkId} (${targetTrunk.name})`);
        
        try {
          await sipClient.deleteSipTrunk(targetTrunk.sipTrunkId);
          console.log('✅ LiveKit inbound trunk deleted successfully');
          trunkDeleted = true;
        } catch (deleteError) {
          console.error(`⚠️ Failed to delete trunk ${targetTrunk.sipTrunkId}:`, deleteError);
        }
      } else {
        console.log('ℹ️ No LiveKit trunk found for this phone number');
      }
    } catch (trunkError) {
      console.error('⚠️ Failed to list/delete LiveKit trunk:', trunkError);
    }
    
    console.log(`🧹 Cleanup summary: ${dispatchRulesDeleted} dispatch rules deleted, trunk deleted: ${trunkDeleted}`);

    // Note: We're keeping the Telnyx FQDN connection as it can be reused
    // when the number is reassigned to avoid recreating connections

    return NextResponse.json({
      success: true,
      message: 'Phone number unassigned successfully',
      data: {
        phoneNumber: phoneNumber.phone_number,
        previousStatus: phoneNumber.status,
        newStatus: 'active',
        cleanup: {
          dispatchRulesDeleted,
          trunkDeleted
        }
      }
    });

  } catch (error: any) {
    console.error('❌ Phone number unassignment error:', error);
    return NextResponse.json({
      success: false,
      error: 'Phone Number Unassignment Failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred',
      fullError: error
    }, { status: 500 });
  }
} 