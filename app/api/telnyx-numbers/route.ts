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

      // Get filter parameters from query string
      const { searchParams } = new URL(request.url);
      const startsWith = searchParams.get('starts_with');

      console.log('🔍 Filter parameters received:');
      console.log('   • starts_with:', startsWith);

      // Search for fresh, purchasable numbers using working API key and filters
      const url = new URL('https://api.telnyx.com/v2/available_phone_numbers');
      
      // Base filters
      url.searchParams.append('filter[limit]', '20');
      url.searchParams.append('filter[phone_number_type]', 'local');
      url.searchParams.append('filter[features][]', 'voice');
      url.searchParams.append('filter[features][]', 'sms');
      url.searchParams.append('filter[country_code]', 'US');
      url.searchParams.append('sort[cost_information][monthly_cost]', 'asc');
      
      // Apply dynamic filters
      if (startsWith && startsWith.trim()) {
        url.searchParams.append('filter[phone_number][starts_with]', startsWith.trim());
        console.log('   • Applied starts_with filter:', startsWith.trim());
      }
      
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
        
        // Check if this is a "no numbers found" error (400 with specific error code)
        if (response.status === 400) {
          try {
            const errorData = JSON.parse(errorText);
            const hasNoNumbersError = errorData.errors?.some((error: any) => 
              error.code === "10031" || error.detail?.includes("No numbers found")
            );
            
            if (hasNoNumbersError) {
              console.log('📱 No numbers found for the given filters - returning empty result');
              // Return empty result instead of throwing error
              return NextResponse.json({ data: [] });
            }
          } catch (parseError) {
            // If we can't parse the error, continue with the original error handling
          }
        }
        
        throw new Error(`Telnyx API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Debug logging to see what Telnyx is returning
      console.log('✅ Telnyx API Response successful');
      console.log('📱 Phone numbers count:', data.data?.length || 0);
      if (data.data?.length > 0) {
        console.log('📱 Sample numbers:', data.data.slice(0, 3).map((n: any) => n.phone_number));
      }
      
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