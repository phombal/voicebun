import { NextResponse } from 'next/server';

const TELNYX_API_KEY = 'KEY019747BF31A87C0761B99B4BAFE19A35_IauIHXvs7wQHzgZMVK2YA0';

export async function GET() {
  try {
    // Add query parameters that might help get full numbers
    const url = new URL('https://api.telnyx.com/v2/available_phone_numbers');
    url.searchParams.append('filter[limit]', '50');
    url.searchParams.append('filter[features]', 'voice,sms');
    url.searchParams.append('filter[country_code]', 'US');
    
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
} 