import { NextResponse } from 'next/server';
import { CacheManager } from '@/lib/redis';

// Get Telnyx API key from environment variables
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

if (!TELNYX_API_KEY) {
  throw new Error('TELNYX_API_KEY environment variable is required');
}

const cacheManager = new CacheManager();

export async function GET() {
  try {
    console.log('🔍 Checking Telnyx account status...');

    // Check cache first
    const cacheKey = 'api:telnyx-account-status';
    const cached = await cacheManager.get(cacheKey);
    
    if (cached) {
      console.log('✅ Returning cached Telnyx account status');
      return NextResponse.json(cached);
    }

    // Get account information
    const accountResponse = await fetch('https://api.telnyx.com/v2/account', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
      },
    });

    if (!accountResponse.ok) {
      const errorText = await accountResponse.text();
      console.error('❌ Failed to get account info:', accountResponse.status, errorText);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        throw new Error(`API error: ${accountResponse.status} - ${errorText}`);
      }

      return NextResponse.json({
        success: false,
        error: 'Failed to retrieve account information',
        details: errorData.errors?.[0]?.detail || errorText,
        telnyxError: errorData.errors?.[0]
      }, { status: accountResponse.status });
    }

    const accountData = await accountResponse.json();

    // Try to get balance information
    let balanceInfo = null;
    try {
      const balanceResponse = await fetch('https://api.telnyx.com/v2/balance', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${TELNYX_API_KEY}`,
        },
      });

      if (balanceResponse.ok) {
        balanceInfo = await balanceResponse.json();
      }
    } catch {
      console.log('Note: Could not retrieve balance information');
    }

    // Try a simple phone number search to test permissions
    let searchPermissions = null;
    try {
      const searchResponse = await fetch('https://api.telnyx.com/v2/available_phone_numbers?filter[country_code]=US&filter[limit]=1', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${TELNYX_API_KEY}`,
        },
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        searchPermissions = {
          canSearch: true,
          numbersFound: searchData.data?.length || 0
        };
      } else {
        const errorText = await searchResponse.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { errors: [{ code: 'unknown', detail: errorText }] };
        }
        
        searchPermissions = {
          canSearch: false,
          error: errorData.errors?.[0]?.code,
          errorDetail: errorData.errors?.[0]?.detail
        };
      }
    } catch (error) {
      searchPermissions = {
        canSearch: false,
        error: 'request_failed',
        errorDetail: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    console.log('✅ Account status retrieved successfully');

    const result = {
      success: true,
      account: {
        id: accountData.data?.id,
        company_name: accountData.data?.company_name,
        admin_email: accountData.data?.admin_email,
        balance: balanceInfo?.data?.balance || 'N/A',
        currency: balanceInfo?.data?.currency || 'USD',
        // Common verification indicators
        phone_number: accountData.data?.phone_number,
        business_identity_verification: accountData.data?.business_identity_verification,
        billing_group_id: accountData.data?.billing_group_id
      },
      permissions: {
        phoneNumberSearch: searchPermissions
      },
      recommendations: getAccountRecommendations(accountData.data, searchPermissions)
    };

    // Cache for 5 minutes (300 seconds)
    await cacheManager.set(cacheKey, result, 300);
    console.log('📦 Cached Telnyx account status for 5 minutes');

    return NextResponse.json(result);

  } catch (error) {
    console.error('❌ Error checking account status:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to check account status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

function getAccountRecommendations(accountData: any, searchPermissions: any): string[] {
  const recommendations: string[] = [];

  if (!searchPermissions?.canSearch) {
    if (searchPermissions?.error === '10038') {
      recommendations.push('Your account level does not permit phone number operations. Please upgrade your account verification.');
    } else if (searchPermissions?.error === '10039') {
      recommendations.push('You have reached account limits. Consider upgrading your account tier.');
    } else if (searchPermissions?.error === '20014' || searchPermissions?.error === '20016') {
      recommendations.push('Complete Level 1 account verification in your Telnyx portal.');
    } else if (searchPermissions?.error === '20017') {
      recommendations.push('Level 2 verification may be required. Contact Telnyx support.');
    } else if (searchPermissions?.error === '20012') {
      recommendations.push('Your account appears to be inactive. Check your balance and payment methods.');
    } else {
      recommendations.push('Phone number search failed. Check your account permissions and verification status.');
    }
  }

  if (!accountData?.phone_number) {
    recommendations.push('Add a verified phone number to your account for better verification status.');
  }

  if (!accountData?.company_name) {
    recommendations.push('Complete your company information in the Telnyx portal.');
  }

  if (recommendations.length === 0) {
    recommendations.push('Your account appears to be properly configured for phone number purchases.');
  }

  return recommendations;
} 