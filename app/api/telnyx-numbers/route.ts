import { NextRequest, NextResponse } from 'next/server';
import { cache } from '@/lib/redis';

export async function GET(request: NextRequest) {
  console.log('📞 Fetching available phone numbers from Telnyx...');
  
  // Check for API key
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey || apiKey.length < 10) {
    console.error('❌ Telnyx API key is missing or invalid');
    return NextResponse.json(
      { error: 'Telnyx API key is not configured properly' },
      { status: 500 }
    );
  }

  // Get query parameters
  const { searchParams } = new URL(request.url);
  const startsWithFilter = searchParams.get('starts_with') || '';

  try {
    // Use Redis caching for the API response
    const phoneNumbers = await cache.cacheApiResponse(
      'telnyx-numbers',
      { starts_with: startsWithFilter },
      async () => {
        // This function will only be called if the data is not in cache
        const baseUrl = 'https://api.telnyx.com/v2/available_phone_numbers';
        const params = new URLSearchParams({
          'filter[country_code]': 'US',
          'filter[limit]': '250',
        });

        // Add multiple feature filters
        params.append('filter[features][]', 'voice');
        params.append('filter[features][]', 'sms');
        
        // Add sorting options
        params.append('sort[]', 'best_effort');
        params.append('sort[]', 'phone_number');

        if (startsWithFilter) {
          params.append('filter[starts_with]', startsWithFilter);
        }

        const url = `${baseUrl}?${params.toString()}`;
        console.log(`🌐 Making request to: ${url}`);

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        });

        console.log(`📊 Telnyx API response status: ${response.status}`);

        if (!response.ok) {
          if (response.status === 400) {
            // Try to parse the error response
            try {
              const errorData = await response.json();
              console.log('Telnyx error response:', errorData);
              
              // Check if it's the "no numbers found" error
              if (errorData.errors && Array.isArray(errorData.errors)) {
                const noNumbersError = errorData.errors.find((error: any) => 
                  error.code === '10031' || 
                  (error.detail && error.detail.includes('No numbers found'))
                );
                
                if (noNumbersError) {
                  console.log('ℹ️ No phone numbers found matching the criteria, returning empty result');
                  return { data: [] };
                }
              }
            } catch (parseError) {
              console.error('Failed to parse error response:', parseError);
            }
          }
          
          throw new Error(`Telnyx API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`✅ Successfully fetched ${data.data?.length || 0} phone numbers from Telnyx`);
        
        return data;
      },
      600 // Cache for 10 minutes (phone number availability doesn't change frequently)
    );

    return NextResponse.json(phoneNumbers);
  } catch (error: any) {
    console.error('❌ Error fetching phone numbers:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch phone numbers' },
      { status: 500 }
    );
  }
} 