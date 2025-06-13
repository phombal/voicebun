import 'server-only'
import { supabaseServiceRole } from './auth'
import Stripe from 'stripe'
import { UserPlan } from './types'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-05-28.basil',
})

/**
 * Check if a user's subscription has expired and downgrade if necessary
 * This is called when users access the application as a safety check
 * SERVER-SIDE ONLY - Do not import this on the client
 */
export async function checkAndUpdateExpiredSubscription(userId: string): Promise<UserPlan | null> {
  try {
    // Get user's current plan
    const { data: userPlan, error } = await supabaseServiceRole
      .from('user_plans')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error || !userPlan) {
      console.log('No user plan found for user:', userId)
      return null
    }

    // Check if subscription is scheduled for cancellation and period has ended
    if (
      userPlan.cancel_at_period_end && 
      userPlan.current_period_end && 
      userPlan.subscription_status === 'active'
    ) {
      const currentTime = new Date()
      const periodEnd = new Date(userPlan.current_period_end)

      console.log(`⏰ Checking subscription expiry for user ${userId}: Period ends ${periodEnd.toISOString()}, Current time ${currentTime.toISOString()}`)

      if (currentTime >= periodEnd) {
        console.log(`🔄 Subscription expired for user ${userId}, downgrading to free plan`)

        // Verify with Stripe if possible
        let shouldDowngrade = true
        if (userPlan.stripe_subscription_id) {
          try {
            const stripeSubscription = await stripe.subscriptions.retrieve(userPlan.stripe_subscription_id)
            // If Stripe subscription is still active, don't downgrade yet
            if (stripeSubscription.status === 'active' && !stripeSubscription.cancel_at_period_end) {
              shouldDowngrade = false
              console.log(`⚠️ Stripe subscription is still active, not downgrading`)
            }
          } catch (stripeError) {
            console.log(`⚠️ Could not retrieve Stripe subscription (may be deleted): ${stripeError}`)
            // If we can't retrieve it, assume it's been deleted and proceed with downgrade
          }
        }

        if (shouldDowngrade) {
          // Downgrade to free plan
          const { data: updatedPlan, error: updateError } = await supabaseServiceRole
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
              conversation_minutes_used: Math.min(userPlan.conversation_minutes_used, 5), // Cap at free limit
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .select()
            .single()

          if (updateError) {
            console.error(`❌ Error downgrading user ${userId}:`, updateError)
            return userPlan
          } else {
            console.log(`✅ Successfully downgraded user ${userId} to free plan`)
            return updatedPlan
          }
        }
      }
    }

    return userPlan
  } catch (error) {
    console.error('Error checking subscription expiry:', error)
    return null
  }
}

/**
 * Sync user plan with Stripe subscription status
 * Useful for ensuring data consistency
 * SERVER-SIDE ONLY - Do not import this on the client
 */
export async function syncUserPlanWithStripe(userId: string): Promise<UserPlan | null> {
  try {
    const { data: userPlan, error } = await supabaseServiceRole
      .from('user_plans')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error || !userPlan || !userPlan.stripe_subscription_id) {
      return userPlan
    }

    // Get current subscription from Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(userPlan.stripe_subscription_id)
    
    // Check if there are any discrepancies
    const needsUpdate = 
      userPlan.subscription_status !== stripeSubscription.status ||
      userPlan.cancel_at_period_end !== stripeSubscription.cancel_at_period_end

    if (needsUpdate) {
      console.log(`🔄 Syncing user plan ${userId} with Stripe subscription`)
      
      // Get period dates from subscription items
      const subscriptionItem = stripeSubscription.items.data[0]
      const currentPeriodStart = subscriptionItem?.current_period_start
      const currentPeriodEnd = subscriptionItem?.current_period_end

      const updates: Partial<UserPlan> = {
        subscription_status: stripeSubscription.status as any,
        cancel_at_period_end: stripeSubscription.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      }

      // Update period dates if available
      if (currentPeriodStart) {
        updates.current_period_start = new Date(currentPeriodStart * 1000).toISOString()
      }
      if (currentPeriodEnd) {
        updates.current_period_end = new Date(currentPeriodEnd * 1000).toISOString()
      }

      const { data: updatedPlan, error: updateError } = await supabaseServiceRole
        .from('user_plans')
        .update(updates)
        .eq('user_id', userId)
        .select()
        .single()

      if (updateError) {
        console.error(`❌ Error syncing user plan ${userId}:`, updateError)
        return userPlan
      }

      console.log(`✅ Successfully synced user plan ${userId} with Stripe`)
      return updatedPlan
    }

    return userPlan
  } catch (error) {
    console.error('Error syncing with Stripe:', error)
    return null
  }
} 