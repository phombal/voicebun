import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-05-28.basil',
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Get user's current subscription from Supabase
    const { data: userPlan, error: planError } = await supabase
      .from('user_plans')
      .select('stripe_subscription_id, stripe_customer_id')
      .eq('user_id', userId)
      .single()

    if (planError || !userPlan?.stripe_subscription_id) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 404 }
      )
    }

    // Cancel the subscription in Stripe (at period end)
    const subscription = await stripe.subscriptions.update(
      userPlan.stripe_subscription_id,
      {
        cancel_at_period_end: true,
      }
    )

    // Update the user plan in Supabase
    const { error: updateError } = await supabase
      .from('user_plans')
      .update({
        cancel_at_period_end: true,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    if (updateError) {
      console.error('Error updating user plan:', updateError)
      return NextResponse.json(
        { error: 'Failed to update subscription status' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Subscription will be canceled at the end of the current billing period',
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: (subscription as any).current_period_end,
    })

  } catch (error: any) {
    console.error('Error canceling subscription:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to cancel subscription' },
      { status: 500 }
    )
  }
} 