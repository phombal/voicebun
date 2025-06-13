import { NextRequest, NextResponse } from 'next/server'
import { supabaseServiceRole } from '@/lib/database/auth'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-05-28.basil',
})

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    console.log('🔄 Reactivating subscription for user:', userId)

    // Get user's current plan
    const { data: userPlan, error: planError } = await supabaseServiceRole
      .from('user_plans')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (planError || !userPlan) {
      console.error('❌ Error fetching user plan:', planError)
      return NextResponse.json(
        { error: 'User plan not found' },
        { status: 404 }
      )
    }

    if (!userPlan.stripe_subscription_id) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 400 }
      )
    }

    if (!userPlan.cancel_at_period_end) {
      return NextResponse.json(
        { error: 'Subscription is not scheduled for cancellation' },
        { status: 400 }
      )
    }

    console.log('📋 Found subscription:', userPlan.stripe_subscription_id)

    // Reactivate the subscription in Stripe
    const subscription = await stripe.subscriptions.update(
      userPlan.stripe_subscription_id,
      {
        cancel_at_period_end: false,
      }
    )

    console.log('✅ Subscription reactivated in Stripe')

    // Update the user plan in database
    const { data: updatedPlan, error: updateError } = await supabaseServiceRole
      .from('user_plans')
      .update({
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select()
      .single()

    if (updateError) {
      console.error('❌ Error updating user plan:', updateError)
      return NextResponse.json(
        { error: 'Failed to update user plan' },
        { status: 500 }
      )
    }

    console.log('✅ User plan updated successfully')

    return NextResponse.json({
      success: true,
      message: 'Subscription has been reactivated',
      plan: updatedPlan,
      period_end: (subscription as any).current_period_end ? new Date((subscription as any).current_period_end * 1000).toISOString() : null,
    })

  } catch (error: any) {
    console.error('💥 Error reactivating subscription:', error)
    return NextResponse.json(
      { error: 'Failed to reactivate subscription', details: error.message },
      { status: 500 }
    )
  }
} 