import { NextRequest, NextResponse } from 'next/server';

const TELNYX_API_KEY = 'KEY01976106909F3A83248E3224B59F5E7A_Rgqv8pzX6B1hHUlVRdZdjp';

export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing exact curl commands...');

    // Test 1: Search for available numbers (your first curl command)
    console.log('🔍 Test 1: Searching for available numbers...');
    
    const searchResponse = await fetch('https://api.telnyx.com/v2/available_phone_numbers?filter[country_code]=us&filter[locality]=Chicago&filter[administrative_area]=IL&filter[limit]=2', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
      },
    });

    const searchText = await searchResponse.text();
    console.log('📤 Search response status:', searchResponse.status);
    console.log('📤 Search response:', searchText);

    if (!searchResponse.ok) {
      return NextResponse.json({
        success: false,
        error: 'Search test failed',
        status: searchResponse.status,
        response: searchText
      }, { status: searchResponse.status });
    }

    const searchData = JSON.parse(searchText);
    const availableNumbers = searchData.data || [];
    
    if (availableNumbers.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No numbers found',
        searchData
      });
    }

    // Test 2: Try to purchase the first available number
    const testNumber = availableNumbers[0].phone_number;
    console.log('💰 Test 2: Attempting to purchase number:', testNumber);

    const purchaseResponse = await fetch('https://api.telnyx.com/v2/number_orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
      },
      body: JSON.stringify({
        phone_numbers: [{"phone_number": testNumber}]
      })
    });

    const purchaseText = await purchaseResponse.text();
    console.log('📤 Purchase response status:', purchaseResponse.status);
    console.log('📤 Purchase response:', purchaseText);

    return NextResponse.json({
      success: true,
      searchTest: {
        status: searchResponse.status,
        numbersFound: availableNumbers.length,
        firstNumber: testNumber
      },
      purchaseTest: {
        status: purchaseResponse.status,
        response: purchaseText,
        success: purchaseResponse.ok
      },
      message: 'Curl tests completed'
    });

  } catch (error) {
    console.error('❌ Curl test error:', error);
    return NextResponse.json({
      success: false,
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 