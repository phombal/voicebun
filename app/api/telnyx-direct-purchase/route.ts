import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/service';
import Telnyx from 'telnyx';
import { expensiveOperationLimit } from '@/lib/middleware/rate-limit';

// Get Telnyx API key from environment variables
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

if (!TELNYX_API_KEY) {
  throw new Error('TELNYX_API_KEY environment variable is required');
}

// Initialize Telnyx client
const telnyx = new Telnyx(TELNYX_API_KEY);

interface DirectPurchaseRequest {
  phoneNumber: string;
  userId: string;
  projectId: string;
}

export async function POST(request: NextRequest) {
  // Apply rate limiting for expensive phone number purchases
  return expensiveOperationLimit(request, async () => {
    try {
      const body: DirectPurchaseRequest = await request.json();
      console.log('🔄 SDK-based purchase request for:', body.phoneNumber);

      // Check phone number limit before purchasing
      console.log('📊 Checking phone number limit for user:', body.userId);
      try {
        const limitCheck = await db.checkPhoneNumberLimitWithServiceRole(body.userId);
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

      // REAL PURCHASE: Call Telnyx SDK
      console.log('💰 Purchasing phone number using Telnyx SDK...');
      
      const { data: numberOrder } = await telnyx.numberOrders.create({
        phone_numbers: [{ "phone_number": body.phoneNumber }]
      });

      console.log('✅ Number order created:', numberOrder);

      if (!numberOrder) {
        throw new Error('No order data returned from Telnyx');
      }

      // The numberOrder should contain the purchased phone number details
      const purchasedNumber = numberOrder.phone_numbers?.[0];
      if (!purchasedNumber) {
        throw new Error('No phone number returned from order');
      }



      // Step 2: Save to database
      console.log('💾 Step 2: Saving to database...');
      
      try {
        await db.createPhoneNumberServerSide({
          phone_number: body.phoneNumber,
          country_code: purchasedNumber.country_code || null,
          phone_number_type: purchasedNumber.phone_number_type || null,
          locality: null, // Will be populated when phone number details are fetched
          user_id: body.userId,
          project_id: null, // Don't auto-assign to project - let user assign manually
          telnyx_order_id: numberOrder.id || null,
          telnyx_phone_number_id: purchasedNumber.id || null,
          connection_id: null, // Will be set when assigned to a project
          messaging_profile_id: null, // Will be set when assigned to a project
          billing_group_id: null, // Optional Telnyx billing group
          customer_reference: null, // Optional customer reference
          dispatch_rule_id: null, // No dispatch rule until assigned to project
          status: 'active',
          is_active: true,
          voice_agent_enabled: false, // Don't enable voice agent until assigned to project
          inbound_enabled: true, // Default to enabled
          outbound_enabled: false, // Default to disabled
          recording_enabled: true, // Default to enabled
          purchased_at: new Date().toISOString(),
          activated_at: new Date().toISOString(), // Set to current time since it's active
        });

        console.log('✅ Phone number saved to database');

        // Increment the user's phone number count
        try {
          await db.incrementPhoneNumberCount(body.userId);
          console.log('✅ Phone number count incremented for user:', body.userId);
        } catch (countError) {
          console.error('❌ Failed to increment phone number count:', countError);
          // Don't fail the request if count increment fails
        }
      } catch (dbError) {
        console.error('❌ Database save failed:', dbError);
        // Don't fail the request if DB save fails, the number was still purchased
      }

      return NextResponse.json({
        success: true,
        phoneNumber: body.phoneNumber,
        telnyxId: purchasedNumber.id,
        orderData: {
          id: numberOrder.id,
          status: numberOrder.status,
          phone_numbers_count: numberOrder.phone_numbers_count,
          created_at: numberOrder.created_at,
          updated_at: numberOrder.updated_at
        },
        phoneNumberData: {
          id: purchasedNumber.id,
          phone_number: purchasedNumber.phone_number,
          status: purchasedNumber.status,
          country_code: purchasedNumber.country_code,
          phone_number_type: purchasedNumber.phone_number_type
        },
        message: 'Phone number purchased successfully using Telnyx SDK'
      });

    } catch (error: any) {
      console.error('❌ SDK purchase error:', error);
      console.error('❌ Error details:', {
        type: error.type,
        statusCode: error.statusCode,
        raw: error.raw,
        headers: error.headers
      });

      // Enhanced error logging for Telnyx errors
      if (error.raw?.errors) {
        console.error('🔍 Telnyx error details:', error.raw.errors);
        error.raw.errors.forEach((telnyxError: any, index: number) => {
          console.error(`❌ Telnyx Error ${index + 1}:`, {
            code: telnyxError.code,
            title: telnyxError.title,
            detail: telnyxError.detail,
            source: telnyxError.source
          });
        });
      }

      // Try to extract the actual error message from Telnyx response
      let errorMessage = 'Unknown error occurred';
      let errorCode = 'unknown';
      
      if (error.raw?.errors?.[0]) {
        const telnyxError = error.raw.errors[0];
        errorMessage = telnyxError.detail || telnyxError.title || telnyxError.message || errorMessage;
        errorCode = telnyxError.code || 'unknown';
        
        // Handle specific 402 error codes
        if (error.statusCode === 402) {
          switch (errorCode) {
            case '20100':
              errorMessage = 'Insufficient funds in your Telnyx account. Please add funds to your account.';
              break;
            case '10038':
              errorMessage = 'Account verification required. Your account level does not permit phone number purchases.';
              break;
            case '10039':
              errorMessage = 'Account limit reached. You have reached the phone number limit for your account level.';
              break;
            case '20012':
              errorMessage = 'Account inactive, possibly due to insufficient funds. Please check your account balance.';
              break;
            default:
              errorMessage = `Payment required: ${errorMessage}`;
          }
        }
      }

      return NextResponse.json({
        success: false,
        error: 'SDK Purchase Failed',
        details: errorMessage,
        errorCode: errorCode,
        statusCode: error.statusCode || 500,
        telnyxError: error.raw?.errors?.[0],
        fullError: {
          type: error.type,
          statusCode: error.statusCode,
          requestId: error.requestId
        }
      }, { status: error.statusCode || 500 });
    }
  });
} 