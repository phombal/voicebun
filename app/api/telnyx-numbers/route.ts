import { NextRequest, NextResponse } from 'next/server';
import { moderateRateLimit } from '@/lib/middleware/rate-limit';

// Get Telnyx API key from environment variables
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

if (!TELNYX_API_KEY) {
  throw new Error('TELNYX_API_KEY environment variable is required');
}

export async function GET(request: NextRequest) {
  // Apply rate limiting for phone number searches
  return moderateRateLimit(request, async () => {
    try {
      // Search for fresh, purchasable numbers using working API key and filters
      const url = new URL('https://api.telnyx.com/v2/available_phone_numbers');
      url.searchParams.append('filter[limit]', '20');
      url.searchParams.append('filter[country_code]', 'US');
      url.searchParams.append('filter[phone_number_type]', 'local');
      url.searchParams.append('filter[features][]', 'voice');
      url.searchParams.append('filter[features][]', 'sms');
      url.searchParams.append('sort[cost_information][monthly_cost]', 'asc');
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${TELNYX_API_KEY}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Telnyx API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Debug logging to see what Telnyx is returning
      console.log('Telnyx API Response:', JSON.stringify(data, null, 2));
      console.log('Phone numbers from Telnyx:', data.data?.map((num: { phone_number: string }) => num.phone_number));
      
      // Return the phone numbers data
      return NextResponse.json(data);
    } catch (error) {
      console.error('Error fetching Telnyx phone numbers:', error);
      return NextResponse.json(
        { error: 'Failed to fetch available phone numbers' },
        { status: 500 }
      );
    }
  });
} 