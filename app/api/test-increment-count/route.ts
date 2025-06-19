import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/service';
import { supabaseServiceRole } from '@/lib/database/server';

interface TestIncrementRequest {
  userId: string;
  action?: 'increment' | 'decrement' | 'sync';
}

export async function POST(request: NextRequest) {
  try {
    const body: TestIncrementRequest = await request.json();
    console.log('🧪 Test increment request:', body);

    const { userId, action = 'increment' } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // Get current user plan before action
    const userPlanBefore = await db.getUserPlanWithServiceRole(userId);
    console.log('📊 User plan before action:', userPlanBefore);

    let result;
    
    try {
      switch (action) {
        case 'increment':
          console.log('📈 Testing increment phone number count...');
          result = await db.incrementPhoneNumberCountWithServiceRole(userId);
          break;
        case 'decrement':
          console.log('📉 Testing decrement phone number count...');
          result = await db.decrementPhoneNumberCount(userId);
          break;
        case 'sync':
          console.log('🔄 Testing sync phone number count...');
          // Call the SQL function directly using supabaseServiceRole
          const { data, error } = await supabaseServiceRole
            .rpc('sync_phone_number_count', { input_user_id: userId });
          
          if (error) throw error;
          
          // Get updated user plan
          result = await db.getUserPlanWithServiceRole(userId);
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      console.log('✅ Action completed successfully:', result);

      // Get updated user plan after action
      const userPlanAfter = await db.getUserPlanWithServiceRole(userId);
      console.log('📊 User plan after action:', userPlanAfter);

      return NextResponse.json({
        success: true,
        action,
        userId,
        before: userPlanBefore,
        after: userPlanAfter,
        result,
        message: `Successfully executed ${action} for user ${userId}`
      });

    } catch (actionError) {
      console.error(`❌ ${action} action failed:`, actionError);
      
      return NextResponse.json({
        success: false,
        action,
        userId,
        error: `${action} failed`,
        details: actionError instanceof Error ? actionError.message : 'Unknown error',
        userPlanBefore
      }, { status: 500 });
    }

  } catch (error) {
    console.error('❌ Test increment error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json(
      { error: 'userId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    // Get current user plan
    const userPlan = await db.getUserPlanWithServiceRole(userId);
    
    // Get actual phone number count using supabaseServiceRole directly
    const { data: phoneNumbers, error } = await supabaseServiceRole
      .from('phone_numbers')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      userId,
      userPlan,
      actualPhoneNumbers: phoneNumbers || [],
      actualCount: phoneNumbers?.length || 0,
      message: 'Current phone number count status'
    });

  } catch (error) {
    console.error('❌ Get count error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to get count',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 