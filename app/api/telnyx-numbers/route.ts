import { NextRequest, NextResponse } from 'next/server';
import { moderateRateLimit } from '@/lib/middleware/rate-limit';

export async function GET(request: NextRequest) {
  // Apply rate limiting for phone number searches
  return moderateRateLimit(request, async () => {
    try {
      // Get Telnyx API key from environment variables at request time
      const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
      
      console.log('🔑 Environment check:');
      console.log('   • API Key exists:', !!TELNYX_API_KEY);
      console.log('   • API Key length:', TELNYX_API_KEY?.length || 0);
      console.log('   • API Key prefix:', TELNYX_API_KEY?.substring(0, 10) || 'NONE');

      if (!TELNYX_API_KEY) {
        console.error('❌ TELNYX_API_KEY environment variable is missing');
        return NextResponse.json(
          { error: 'Telnyx API key not configured' },
          { status: 500 }
        );
      }

      // Search for fresh, purchasable numbers using working API key and filters
      const url = new URL('https://api.telnyx.com/v2/available_phone_numbers');
      url.searchParams.append('filter[limit]', '20');
      url.searchParams.append('filter[country_code]', 'US');
      url.searchParams.append('filter[phone_number_type]', 'local');
      url.searchParams.append('filter[features][]', 'voice');
      url.searchParams.append('filter[features][]', 'sms');
      url.searchParams.append('sort[cost_information][monthly_cost]', 'asc');
      
      console.log('📡 Making Telnyx API request to:', url.toString());
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${TELNYX_API_KEY}`,
        },
      });

      console.log('📡 Telnyx API response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Telnyx API error response:', errorText);
        throw new Error(`Telnyx API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Debug logging to see what Telnyx is returning
      console.log('✅ Telnyx API Response successful');
      console.log('📱 Phone numbers count:', data.data?.length || 0);
      
      // Return the phone numbers data
      return NextResponse.json(data);
    } catch (error) {
      console.error('❌ Error in telnyx-numbers route:', error);
      return NextResponse.json(
        { error: 'Failed to fetch available phone numbers' },
        { status: 500 }
      );
    }
  });
} 