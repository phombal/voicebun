import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('📞 Test save phone number request:', body);

    // Save the phone number directly to database
    const phoneNumberRecord = await db.createPhoneNumberServerSide({
      phone_number: body.phone_number,
      country_code: body.country_code || null,
      phone_number_type: body.phone_number_type || null,
      locality: body.locality || null,
      user_id: body.user_id,
      project_id: body.project_id || null,
      telnyx_order_id: body.telnyx_order_id || null,
      telnyx_phone_number_id: body.telnyx_phone_number_id || null,
      connection_id: body.connection_id || null,
      messaging_profile_id: body.messaging_profile_id || null,
      billing_group_id: body.billing_group_id || null,
      customer_reference: body.customer_reference || null,
      dispatch_rule_id: body.dispatch_rule_id || null,
      status: body.status || 'active',
      is_active: body.is_active !== undefined ? body.is_active : true,
      voice_agent_enabled: body.voice_agent_enabled !== undefined ? body.voice_agent_enabled : false,
      inbound_enabled: body.inbound_enabled !== undefined ? body.inbound_enabled : true,
      outbound_enabled: body.outbound_enabled !== undefined ? body.outbound_enabled : false,
      recording_enabled: body.recording_enabled !== undefined ? body.recording_enabled : true,
      purchased_at: body.purchased_at || new Date().toISOString(),
      activated_at: body.activated_at || null,
    });

    console.log('✅ Phone number saved successfully:', phoneNumberRecord);

    return NextResponse.json({
      success: true,
      message: 'Phone number saved to database successfully',
      phoneNumber: phoneNumberRecord
    });

  } catch (error: any) {
    console.error('❌ Error saving phone number:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to save phone number',
      details: error.message
    }, { status: 500 });
  }
} 