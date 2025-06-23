import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/service';
import { expensiveOperationLimit } from '@/lib/middleware/rate-limit';
import { PurchasePhoneNumberSchema, validateRequestSafe } from '@/lib/validation/schemas';

// Get Telnyx API key from environment variables
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

if (!TELNYX_API_KEY) {
  throw new Error('TELNYX_API_KEY environment variable is required');
}

interface TelnyxError {
  code: string;
  title: string;
  detail: string;
  source?: {
    pointer?: string;
    parameter?: string;
  };
}

interface TelnyxErrorResponse {
  errors: TelnyxError[];
}

export async function POST(request: NextRequest) {
  // Apply rate limiting for expensive phone number purchases
  return expensiveOperationLimit(request, async () => {
    try {
      const body = await request.json();
      
      // Validate request body
      const validation = validateRequestSafe(PurchasePhoneNumberSchema, body);
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid request data', details: validation.error },
          { status: 400 }
        );
      }
      
      const validatedData = validation.data!;
      const { 
        phoneNumber, 
        userId, 
        projectId, 
        connectionId, 
        messagingProfileId, 
        billingGroupId, 
        customerReference 
      } = validatedData;

      if (!phoneNumber || !userId || !projectId) {
        return NextResponse.json(
          { error: 'Phone number, user ID, and project ID are required' },
          { status: 400 }
        );
      }

      console.log('📱 Purchasing phone number:', phoneNumber, 'for user:', userId, 'project:', projectId);

      // Check phone number limit before purchasing
      console.log('📊 Checking phone number limit for user:', userId);
      try {
        const limitCheck = await db.checkPhoneNumberLimitWithServiceRole(userId);
        console.log('📊 Phone number limit check result:', limitCheck);
        
        if (!limitCheck.canPurchase) {
          return NextResponse.json({
            error: 'Phone number limit exceeded',
            details: `You have reached your phone number limit (${limitCheck.currentCount}/${limitCheck.limit}). Please upgrade your plan to purchase more phone numbers.`,
            currentCount: limitCheck.currentCount,
            limit: limitCheck.limit,
            upgradeRequired: true
          }, { status: 403 });
        }
      } catch (error) {
        console.error('❌ Error checking phone number limit:', error);
        return NextResponse.json({
          error: 'Failed to check phone number limit',
          details: 'Unable to verify your phone number purchase limit. Please try again.'
        }, { status: 500 });
      }

      // First, search for the number to ensure it's available and get its details
      console.log('🔍 Searching for phone number availability...');
      const searchResponse = await fetch(`https://api.telnyx.com/v2/available_phone_numbers?filter[phone_number]=${encodeURIComponent(phoneNumber)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${TELNYX_API_KEY}`,
        },
      });

      if (!searchResponse.ok) {
        const searchErrorText = await searchResponse.text();
        console.error('❌ Phone number search failed:', searchResponse.status, searchErrorText);
        
        let searchErrorData: TelnyxErrorResponse;
        try {
          searchErrorData = JSON.parse(searchErrorText);
        } catch {
          throw new Error(`Failed to search for phone number: ${searchResponse.status} - ${searchErrorText}`);
        }

        const firstError = searchErrorData.errors?.[0];
        if (firstError) {
          // Handle specific search errors
          switch (firstError.code) {
            case '10038':
              return NextResponse.json({
                error: 'Account verification required',
                details: 'Your account level does not permit phone number purchases. Please upgrade your account verification level.',
                telnyxError: firstError,
                upgradeUrl: 'https://telnyx.com/upgrade'
              }, { status: 403 });
            case '10039':
              return NextResponse.json({
                error: 'Account limit reached',
                details: 'You have reached the phone number limit for your account level. Please upgrade your account or contact support.',
                telnyxError: firstError,
                upgradeUrl: 'https://telnyx.com/upgrade'
              }, { status: 403 });
            case '20014':
            case '20016':
              return NextResponse.json({
                error: 'Account verification required',
                details: 'Your account needs to be verified before purchasing phone numbers. Please complete account verification in the Telnyx portal.',
                telnyxError: firstError
              }, { status: 403 });
            case '20012':
              return NextResponse.json({
                error: 'Account inactive',
                details: 'Your account is inactive, possibly due to insufficient funds. Please check your account balance.',
                telnyxError: firstError
              }, { status: 403 });
            default:
              return NextResponse.json({
                error: 'Search failed',
                details: firstError.detail || 'Failed to search for phone number availability',
                telnyxError: firstError
              }, { status: 400 });
          }
        }
        
        throw new Error(`Phone number search failed: ${searchResponse.status} - ${searchErrorText}`);
      }

      const searchData = await searchResponse.json();
      console.log('✅ Phone number search successful, found:', searchData.data?.length || 0, 'results');

      if (!searchData.data || searchData.data.length === 0) {
        return NextResponse.json({
          error: 'Phone number not available',
          details: 'The requested phone number is not available for purchase.'
        }, { status: 400 });
      }

      // Create the number order
      console.log('📡 Creating number order...');
      const orderPayload = {
        phone_numbers: [
          {
            phone_number: phoneNumber,
          }
        ],
        ...(connectionId && { connection_id: connectionId }),
        ...(messagingProfileId && { messaging_profile_id: messagingProfileId }),
        ...(billingGroupId && { billing_group_id: billingGroupId }),
        customer_reference: customerReference || `VoiceAgent-${userId}-${projectId}-${Date.now()}`
      };

      console.log('📡 Sending order to Telnyx:', orderPayload);

      // Make the purchase request to Telnyx
      const response = await fetch('https://api.telnyx.com/v2/number_orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${TELNYX_API_KEY}`,
        },
        body: JSON.stringify(orderPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Telnyx order API error:', response.status, errorText);
        
        let errorData: TelnyxErrorResponse;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          throw new Error(`Telnyx API error: ${response.status} - ${errorText}`);
        }

        const firstError = errorData.errors?.[0];
        if (firstError) {
          console.error('❌ Telnyx error details:', firstError);
          
          // Handle specific ordering errors with more helpful messages
          switch (firstError.code) {
            case '10038':
              return NextResponse.json({
                error: 'Account verification required',
                details: 'Your Telnyx account level does not permit phone number purchases. You may need Level 2 verification for certain features.',
                telnyxError: firstError,
                upgradeUrl: 'https://telnyx.com/upgrade',
                supportAction: 'Please upgrade your account verification level or contact Telnyx support.'
              }, { status: 403 });
              
            case '10039':
              return NextResponse.json({
                error: 'Account limit reached',
                details: 'You have reached the phone number purchase limit for your account level.',
                telnyxError: firstError,
                upgradeUrl: 'https://telnyx.com/upgrade',
                supportAction: 'Please upgrade your account or contact Telnyx support to increase your limits.'
              }, { status: 403 });
              
            case '85007':
              return NextResponse.json({
                error: 'Reservation limit exceeded',
                details: 'You have too many active phone number reservations. Please wait for current reservations to complete or expire.',
                telnyxError: firstError,
                supportAction: 'Try again later or contact Telnyx support.'
              }, { status: 403 });
              
            case '85001':
              return NextResponse.json({
                error: 'Phone number no longer available',
                details: 'The phone number is no longer available for purchase. It may have been purchased by another customer.',
                telnyxError: firstError,
                supportAction: 'Please search for and select a different phone number.'
              }, { status: 400 });
              
            case '85000':
              return NextResponse.json({
                error: 'Search required before purchase',
                details: 'You must search for the number through the API before attempting to purchase it.',
                telnyxError: firstError,
                supportAction: 'This error should not occur as we search before purchasing. Please try again.'
              }, { status: 400 });
              
            case '20014':
            case '20016':
              return NextResponse.json({
                error: 'Account verification required',
                details: 'Your Telnyx account needs Level 1 verification before purchasing phone numbers.',
                telnyxError: firstError,
                supportAction: 'Please complete account verification in your Telnyx Mission Control Portal.'
              }, { status: 403 });
              
            case '20017':
              return NextResponse.json({
                error: 'Level 2 verification required',
                details: 'This action requires Level 2 account verification.',
                telnyxError: firstError,
                supportAction: 'Please contact Telnyx support to complete Level 2 verification.'
              }, { status: 403 });
              
            case '20012':
              return NextResponse.json({
                error: 'Account inactive',
                details: 'Your Telnyx account is inactive, possibly due to insufficient funds.',
                telnyxError: firstError,
                supportAction: 'Please check your account balance and add funds if necessary.'
              }, { status: 403 });
              
            case '20013':
              return NextResponse.json({
                error: 'Account blocked',
                details: 'Your Telnyx account has been blocked.',
                telnyxError: firstError,
                supportAction: 'Please contact Telnyx support for assistance.'
              }, { status: 403 });
              
            case '20100':
              return NextResponse.json({
                error: 'Insufficient funds',
                details: 'Your account does not have sufficient funds to purchase this phone number.',
                telnyxError: firstError,
                supportAction: 'Please add funds to your Telnyx account and try again.'
              }, { status: 403 });
              
            default:
              return NextResponse.json({
                error: 'Purchase failed',
                details: firstError.detail || 'Failed to purchase phone number',
                telnyxError: firstError,
                supportAction: 'Please contact Telnyx support if this error persists.'
              }, { status: 400 });
          }
        }
        
        throw new Error(`Telnyx API error: ${response.status} - ${errorText}`);
      }

      const orderData = await response.json();
      console.log('✅ Telnyx order created:', orderData);

      // Store the phone number in the database
      const phoneNumberRecord = await db.createPhoneNumberServerSide({
        phone_number: phoneNumber,
        country_code: null, // Will be populated when phone number details are fetched
        phone_number_type: null, // Will be populated when phone number details are fetched
        locality: null, // Will be populated when phone number details are fetched
        project_id: null, // Don't auto-assign to project
        user_id: userId, // Explicitly set the user ID
        telnyx_order_id: orderData.data.id,
        telnyx_phone_number_id: orderData.data.phone_numbers[0]?.id || null,
        connection_id: null, // Will be set when assigned to a project
        messaging_profile_id: null, // Will be set when assigned to a project
        billing_group_id: null, // Optional Telnyx billing group
        customer_reference: null, // Optional customer reference
        dispatch_rule_id: null, // Will be set when assigned to a project
        status: orderData.data.status || 'pending',
        is_active: true,
        voice_agent_enabled: false,
        inbound_enabled: true, // Default to enabled
        outbound_enabled: false, // Default to disabled
        recording_enabled: true, // Default to enabled
        purchased_at: new Date().toISOString(),
        activated_at: null, // Will be set when phone number is activated
      });

      console.log('📝 Phone number record stored in database:', phoneNumberRecord);

      // Increment phone number count for the user
      try {
        await db.incrementPhoneNumberCountWithServiceRole(userId);
        console.log('✅ Incremented phone number count for user:', userId);
      } catch (error) {
        console.error('⚠️ Warning: Failed to increment phone number count:', error);
        // Don't fail the request since the phone number was purchased successfully
      }

      return NextResponse.json({
        success: true,
        message: 'Phone number purchase initiated successfully',
        phoneNumberRecord,
        telnyxOrder: orderData,
      });

    } catch (error) {
      console.error('❌ Error purchasing phone number:', error);
      
      // Check if it's a known Telnyx account limit error
      if (error instanceof Error) {
        if (error.message.includes('10038') || error.message.includes('Feature not permitted')) {
          return NextResponse.json({
            error: 'Account verification required',
            details: 'Your Telnyx account level does not permit phone number purchases. Please upgrade your account verification.',
            supportAction: 'Contact Telnyx support or upgrade your account verification level.',
            upgradeUrl: 'https://telnyx.com/upgrade'
          }, { status: 403 });
        }
        
        if (error.message.includes('10039') || error.message.includes('Feature limited')) {
          return NextResponse.json({
            error: 'Account limit reached',
            details: 'You have reached the phone number limit for your account level.',
            supportAction: 'Please upgrade your account or contact Telnyx support.',
            upgradeUrl: 'https://telnyx.com/upgrade'
          }, { status: 403 });
        }
      }
      
      return NextResponse.json({
        error: 'Failed to purchase phone number',
        details: error instanceof Error ? error.message : 'Unknown error',
        supportAction: 'Please try again or contact support if the issue persists.'
      }, { status: 500 });
    }
  });
} 