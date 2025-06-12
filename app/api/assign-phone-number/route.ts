import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/service';

const TELNYX_API_KEY = 'KEY01976106909F3A83248E3224B59F5E7A_Rgqv8pzX6B1hHUlVRdZdjp';

interface AssignPhoneNumberRequest {
  phoneNumberId: string;
  projectId: string;
  userId: string;
  sipHost: string; // LiveKit SIP host
}

export async function POST(request: NextRequest) {
  try {
    const body: AssignPhoneNumberRequest = await request.json();
    console.log('📞 Assigning phone number to project:', {
      phoneNumberId: body.phoneNumberId,
      projectId: body.projectId,
      sipHost: body.sipHost
    });

    // Step 1: Get the phone number from our database to get the actual phone number
    const phoneNumber = await db.getPhoneNumber(body.phoneNumberId);
    if (!phoneNumber) {
      return NextResponse.json({
        success: false,
        error: 'Phone number not found',
        details: 'The specified phone number ID was not found in the database'
      }, { status: 404 });
    }

    console.log('📱 Found phone number:', phoneNumber.phone_number);

    // Step 2: Create FQDN connection in Telnyx
    console.log('🔗 Step 1: Creating FQDN connection...');
    
    // Create a unique connection name to avoid conflicts
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const uniqueConnectionName = `LiveKit-${phoneNumber.phone_number.replace('+', '')}-${timestamp}-${randomId}`;
    
    const fqdnConnectionResponse = await fetch('https://api.telnyx.com/v2/fqdn_connections', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
      },
      body: JSON.stringify({
        active: true,
        anchorsite_override: "Latency",
        connection_name: uniqueConnectionName,
        inbound: {
          ani_number_format: "+E.164",
          dnis_number_format: "+e164"
        }
      })
    });

    if (!fqdnConnectionResponse.ok) {
      const errorText = await fqdnConnectionResponse.text();
      console.error('❌ FQDN connection creation failed:', errorText);
      return NextResponse.json({
        success: false,
        error: 'FQDN Connection Creation Failed',
        details: `Failed to create FQDN connection: ${fqdnConnectionResponse.status} - ${errorText}`
      }, { status: fqdnConnectionResponse.status });
    }

    const fqdnConnectionData = await fqdnConnectionResponse.json();
    const connectionId = fqdnConnectionData.data.id;
    console.log('✅ FQDN connection created:', connectionId);

    // Step 3: Create FQDN with SIP URI
    console.log('🌐 Step 2: Creating FQDN with SIP URI...');
    
    const fqdnResponse = await fetch('https://api.telnyx.com/v2/fqdns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
      },
      body: JSON.stringify({
        connection_id: connectionId,
        fqdn: body.sipHost,
        port: 5060,
        dns_record_type: "a"
      })
    });

    if (!fqdnResponse.ok) {
      const errorText = await fqdnResponse.text();
      console.error('❌ FQDN creation failed:', errorText);
      return NextResponse.json({
        success: false,
        error: 'FQDN Creation Failed',
        details: `Failed to create FQDN: ${fqdnResponse.status} - ${errorText}`
      }, { status: fqdnResponse.status });
    }

    const fqdnData = await fqdnResponse.json();
    console.log('✅ FQDN created:', fqdnData.data.fqdn);

    // Step 4: Get the Telnyx phone number ID using the phone number
    console.log('🔍 Step 3: Getting Telnyx phone number ID...');
    
    const phoneNumberSearchResponse = await fetch(
      `https://api.telnyx.com/v2/phone_numbers?filter[phone_number]=${encodeURIComponent(phoneNumber.phone_number)}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${TELNYX_API_KEY}`,
        }
      }
    );

    if (!phoneNumberSearchResponse.ok) {
      const errorText = await phoneNumberSearchResponse.text();
      console.error('❌ Phone number search failed:', errorText);
      return NextResponse.json({
        success: false,
        error: 'Phone Number Search Failed',
        details: `Failed to find phone number in Telnyx: ${phoneNumberSearchResponse.status} - ${errorText}`
      }, { status: phoneNumberSearchResponse.status });
    }

    const phoneNumberSearchData = await phoneNumberSearchResponse.json();
    if (!phoneNumberSearchData.data || phoneNumberSearchData.data.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Phone Number Not Found in Telnyx',
        details: `Phone number ${phoneNumber.phone_number} was not found in your Telnyx account`
      }, { status: 404 });
    }

    const telnyxPhoneNumberId = phoneNumberSearchData.data[0].id;
    console.log('✅ Found Telnyx phone number ID:', telnyxPhoneNumberId);

    // Step 5: Associate the phone number with the FQDN connection
    console.log('🔗 Step 4: Associating phone number with FQDN connection...');
    
    const associateResponse = await fetch(`https://api.telnyx.com/v2/phone_numbers/${telnyxPhoneNumberId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
      },
      body: JSON.stringify({
        id: telnyxPhoneNumberId,
        connection_id: connectionId
      })
    });

    if (!associateResponse.ok) {
      const errorText = await associateResponse.text();
      console.error('❌ Phone number association failed:', errorText);
      return NextResponse.json({
        success: false,
        error: 'Phone Number Association Failed',
        details: `Failed to associate phone number with connection: ${associateResponse.status} - ${errorText}`
      }, { status: associateResponse.status });
    }

    const associateData = await associateResponse.json();
    console.log('✅ Phone number associated with connection');

    // Step 6: Setup LiveKit inbound trunk with latest configuration
    console.log('🎯 Step 5: Setting up LiveKit inbound trunk with latest project configuration...');
    
    try {
      // First, ensure we have the latest project configuration from Supabase
      console.log('📊 Retrieving latest project configuration from database...');
      const latestProjectData = await db.getProjectData(body.projectId);
      console.log('✅ Latest project data retrieved:', latestProjectData ? 'found' : 'not found');
      
      if (latestProjectData) {
        console.log('📋 Project configuration summary:', {
          llm_provider: latestProjectData.llm_provider,
          llm_model: latestProjectData.llm_model,
          tts_provider: latestProjectData.tts_provider,
          tts_voice: latestProjectData.tts_voice,
          stt_provider: latestProjectData.stt_provider,
          stt_language: latestProjectData.stt_language,
          first_message_mode: latestProjectData.first_message_mode,
          response_latency_priority: latestProjectData.response_latency_priority
        });
      }
      
      // Call our LiveKit trunk setup API which will use the latest config
      const trunkSetupResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/setup-livekit-trunk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumberId: body.phoneNumberId,
          phoneNumber: phoneNumber.phone_number,
          projectId: body.projectId
        })
      });

      if (trunkSetupResponse.ok) {
        const trunkSetupData = await trunkSetupResponse.json();
        console.log('✅ LiveKit trunk setup completed with latest configuration:', trunkSetupData.method);
      } else {
        const errorText = await trunkSetupResponse.text();
        console.log('⚠️ LiveKit trunk setup failed:', errorText);
      }
      
    } catch (liveKitError) {
      console.error('❌ LiveKit inbound trunk setup failed:', liveKitError);
      // Don't fail the request - Telnyx setup was successful
    }

    // Step 6: Update our database with assignment status
    console.log('💾 Step 6: Updating database with assignment status...');
    
    try {
      await db.updatePhoneNumber(body.phoneNumberId, {
        status: 'assigned',
        project_id: body.projectId, // Set the project ID to mark as assigned
        voice_agent_enabled: true,
        updated_at: new Date().toISOString()
      });
      console.log('✅ Database updated successfully');
    } catch (dbError) {
      console.error('❌ Database update failed:', dbError);
      // Don't fail the request if DB update fails, the Telnyx setup was successful
    }

    return NextResponse.json({
      success: true,
      message: 'Phone number successfully assigned to project with LiveKit integration',
      data: {
        phoneNumber: phoneNumber.phone_number,
        connectionId: connectionId,
        fqdn: fqdnData.data.fqdn,
        sipHost: body.sipHost,
        telnyxPhoneNumberId: telnyxPhoneNumberId
      }
    });

  } catch (error: any) {
    console.error('❌ Phone number assignment error:', error);
    return NextResponse.json({
      success: false,
      error: 'Phone Number Assignment Failed',
      details: error instanceof Error ? error.message : 'Unknown error occurred',
      fullError: error
    }, { status: 500 });
  }
} 