import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-05-28.basil',
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🔄 Starting expired subscription check...')

    // Get all active subscriptions that are scheduled for cancellation
    const { data: expiredPlans, error } = await supabase
      .from('user_plans')
      .select('*')
      .eq('subscription_status', 'active')
      .eq('cancel_at_period_end', true)
      .not('current_period_end', 'is', null)

    if (error) {
      console.error('❌ Error fetching expired plans:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    console.log(`📊 Found ${expiredPlans?.length || 0} plans scheduled for cancellation`)

    let processedCount = 0
    let errorCount = 0

    for (const plan of expiredPlans || []) {
      try {
        const currentTime = new Date()
        const periodEnd = new Date(plan.current_period_end)

        console.log(`⏰ Checking plan ${plan.id}: Period ends ${periodEnd.toISOString()}, Current time ${currentTime.toISOString()}`)

        // Check if the subscription period has actually ended
        if (currentTime >= periodEnd) {
          console.log(`🔄 Subscription expired for user ${plan.user_id}, downgrading to free plan`)

          // Double-check with Stripe to ensure subscription is actually canceled
          let stripeSubscriptionStatus = 'unknown'
          if (plan.stripe_subscription_id) {
            try {
              const stripeSubscription = await stripe.subscriptions.retrieve(plan.stripe_subscription_id)
              stripeSubscriptionStatus = stripeSubscription.status
              console.log(`📋 Stripe subscription status: ${stripeSubscriptionStatus}`)
            } catch (stripeError) {
              console.log(`⚠️ Could not retrieve Stripe subscription (may be deleted): ${stripeError}`)
              stripeSubscriptionStatus = 'deleted'
            }
          }

          // Downgrade to free plan
          const { error: updateError } = await supabase
            .from('user_plans')
            .update({
              plan_name: 'free',
              subscription_status: 'inactive',
              stripe_subscription_id: null,
              stripe_price_id: null,
              current_period_start: null,
              current_period_end: null,
              cancel_at_period_end: false,
              conversation_minutes_limit: 5, // Free plan limit
              conversation_minutes_used: Math.min(plan.conversation_minutes_used, 5), // Cap at free limit
              updated_at: new Date().toISOString(),
            })
            .eq('id', plan.id)

          if (updateError) {
            console.error(`❌ Error updating plan ${plan.id}:`, updateError)
            errorCount++
          } else {
            console.log(`✅ Successfully downgraded user ${plan.user_id} to free plan`)
            processedCount++
          }
        } else {
          console.log(`⏳ Subscription for user ${plan.user_id} not yet expired (${Math.ceil((periodEnd.getTime() - currentTime.getTime()) / (1000 * 60 * 60 * 24))} days remaining)`)
        }
      } catch (planError) {
        console.error(`💥 Error processing plan ${plan.id}:`, planError)
        errorCount++
      }
    }

    console.log(`✅ Expired subscription check completed: ${processedCount} processed, ${errorCount} errors`)

    return NextResponse.json({
      success: true,
      message: 'Expired subscription check completed',
      processed: processedCount,
      errors: errorCount,
      total_checked: expiredPlans?.length || 0,
    })

  } catch (error: any) {
    console.error('💥 Cron job error:', error)
    return NextResponse.json(
      { error: 'Cron job failed', details: error.message },
      { status: 500 }
    )
  }
} 