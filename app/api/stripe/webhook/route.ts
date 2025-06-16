import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { db } from '@/lib/database/service';
import Stripe from 'stripe';

// Force dynamic rendering since we use request body and headers
export const dynamic = 'force-dynamic';

// Validate required environment variables
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

if (!STRIPE_WEBHOOK_SECRET) {
  throw new Error('STRIPE_WEBHOOK_SECRET environment variable is required');
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2025-05-28.basil',
});

const endpointSecret = STRIPE_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const headersList = headers();
    const sig = headersList.get('stripe-signature');

    console.log('🔍 Webhook debugging info:', {
      hasBody: !!body,
      bodyLength: body.length,
      hasSignature: !!sig,
      signaturePreview: sig ? sig.substring(0, 50) + '...' : 'None',
      webhookSecret: STRIPE_WEBHOOK_SECRET ? 'Present (whsec_...)' : 'Missing',
      contentType: headersList.get('content-type'),
    });

    if (!sig) {
      console.error('❌ No stripe-signature header found');
      return NextResponse.json({ error: 'No signature header' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
      console.log('✅ Webhook signature verified successfully');
    } catch (err: any) {
      console.error('⚠️ Webhook signature verification failed:', {
        error: err.message,
        signature: sig,
        bodyPreview: body.substring(0, 200),
        secretUsed: endpointSecret ? 'whsec_...' + endpointSecret.slice(-8) : 'None'
      });
      return NextResponse.json({ 
        error: 'Webhook signature verification failed',
        details: err.message 
      }, { status: 400 });
    }

    console.log('🎯 Stripe webhook event received:', event.type);
    console.log('📋 Event data:', JSON.stringify(event.data, null, 2));

    // Helper function to safely convert timestamp to ISO string - moved to top level
    const timestampToISO = (timestamp: any, fieldName: string = 'unknown'): string | null => {
      console.log(`⏰ Converting timestamp for ${fieldName}:`, timestamp, 'type:', typeof timestamp);
      
      // Check for null/undefined
      if (timestamp === null || timestamp === undefined) {
        console.log(`❌ ${fieldName} timestamp is null/undefined, returning null`);
        return null;
      }
      
      // Check if it's a number
      if (typeof timestamp !== 'number') {
        console.log(`❌ ${fieldName} timestamp is not a number (${typeof timestamp}), returning null`);
        return null;
      }
      
      // Check if it's a valid positive number
      if (timestamp <= 0 || !isFinite(timestamp)) {
        console.log(`❌ ${fieldName} timestamp is invalid number (${timestamp}), returning null`);
        return null;
      }
      
      try {
        // Create date object
        const date = new Date(timestamp * 1000);
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
          console.log(`❌ ${fieldName} created invalid Date object from timestamp ${timestamp}, returning null`);
          return null;
        }
        
        const isoString = date.toISOString();
        console.log(`✅ Converted ${fieldName} timestamp`, timestamp, 'to ISO:', isoString);
        return isoString;
      } catch (error) {
        console.error(`💥 Error converting ${fieldName} timestamp:`, timestamp, error);
        return null;
      }
    };

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('💳 Checkout session completed:', session.id);
        console.log('📊 Session details:', {
          mode: session.mode,
          customer: session.customer,
          subscription: session.subscription,
          metadata: session.metadata
        });
        
        if (session.mode === 'subscription' && session.customer && session.subscription) {
          console.log('🔍 Retrieving subscription details for:', session.subscription);
          
          try {
            // Get the subscription details
            const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
            
            // Get the current period dates from the subscription items
            const subscriptionItem = subscription.items.data[0];
            const currentPeriodStart = subscriptionItem?.current_period_start;
            const currentPeriodEnd = subscriptionItem?.current_period_end;
            
            console.log('📈 Retrieved subscription raw data:', {
              id: subscription.id,
              status: subscription.status,
              current_period_start_raw: currentPeriodStart,
              current_period_end_raw: currentPeriodEnd,
              cancel_at_period_end_raw: subscription.cancel_at_period_end,
              metadata: subscription.metadata
            });
            
            const customer = await stripe.customers.retrieve(session.customer as string);
            console.log('👤 Retrieved customer:', {
              id: customer.id,
              email: (customer as any).email
            });
            
            // Extract user ID from metadata
            const userId = session.metadata?.user_id;
            console.log('🆔 User ID from metadata:', userId);
            
            if (userId) {
              // Convert timestamps with detailed logging
              const currentPeriodStartISO = timestampToISO(currentPeriodStart, 'current_period_start');
              const currentPeriodEndISO = timestampToISO(currentPeriodEnd, 'current_period_end');
              
              // Update or create user plan
              const planData = {
                plan_name: 'professional' as const,
                subscription_status: 'active' as const,
                stripe_customer_id: session.customer as string,
                stripe_subscription_id: session.subscription as string,
                stripe_price_id: subscription.items.data[0]?.price.id || null,
                current_period_start: currentPeriodStartISO,
                current_period_end: currentPeriodEndISO,
                cancel_at_period_end: subscription.cancel_at_period_end || false,
                conversation_minutes_used: 0,
                conversation_minutes_limit: 400, // Professional plan limit
              };

              console.log('📝 Plan data to save:', JSON.stringify(planData, null, 2));

              try {
                // Try to update existing plan first
                console.log('🔄 Attempting to update existing user plan for user:', userId);
                await db.updateUserPlanWithServiceRole(userId, planData);
                console.log('✅ Updated existing user plan for user:', userId);
              } catch (error) {
                console.log('⚠️ Update failed, attempting to create new plan. Error:', error);
                // If no existing plan, create a new one
                try {
                  await db.createUserPlanWithServiceRole(userId, planData);
                  console.log('✅ Created new user plan for user:', userId);
                } catch (createError) {
                  console.error('💥 Failed to create user plan:', createError);
                  throw createError;
                }
              }
            } else {
              console.error('❌ No user ID found in session metadata');
            }
          } catch (subscriptionError) {
            console.error('💥 Error processing subscription:', subscriptionError);
            throw subscriptionError;
          }
        } else {
          console.log('⚠️ Session is not a subscription or missing required data:', {
            mode: session.mode,
            customer: !!session.customer,
            subscription: !!session.subscription
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('🔄 Subscription updated:', subscription.id);
        
        // Get the current period dates from the subscription items
        const subscriptionItem = subscription.items.data[0];
        const currentPeriodStart = subscriptionItem?.current_period_start;
        const currentPeriodEnd = subscriptionItem?.current_period_end;
        
        console.log('📊 Subscription update raw data:', {
          status: subscription.status,
          current_period_start_raw: currentPeriodStart,
          current_period_end_raw: currentPeriodEnd,
          cancel_at_period_end_raw: subscription.cancel_at_period_end,
          metadata: subscription.metadata
        });
        
        // Find user by stripe subscription ID
        const userId = subscription.metadata?.user_id;
        console.log('🆔 User ID from subscription metadata:', userId);
        
        if (userId) {
          const userPlan = await db.getUserPlanWithServiceRole(userId);
          console.log('👤 Found user plan:', !!userPlan);
          
          if (userPlan) {
            // Convert timestamps with detailed logging
            const currentPeriodStartISO = timestampToISO(currentPeriodStart, 'current_period_start');
            const currentPeriodEndISO = timestampToISO(currentPeriodEnd, 'current_period_end');

            // Check if subscription has actually ended (status is 'canceled' and period has ended)
            if (subscription.status === 'canceled') {
              console.log('🔄 Subscription has ended, downgrading to free plan');
              const updates = {
                plan_name: 'free' as const,
                subscription_status: 'inactive' as const,
                stripe_subscription_id: null,
                stripe_price_id: null,
                current_period_start: null,
                current_period_end: null,
                cancel_at_period_end: false,
                conversation_minutes_limit: 5, // Free plan limit
                conversation_minutes_used: Math.min(userPlan.conversation_minutes_used, 5), // Cap at free limit
              };
              
              await db.updateUserPlanWithServiceRole(userPlan.user_id, updates);
              console.log('✅ Downgraded user to free plan:', userPlan.user_id);
            } else {
              // Regular subscription update (still active but may be scheduled for cancellation)
              const updates = {
                subscription_status: subscription.status as any,
                current_period_start: currentPeriodStartISO,
                current_period_end: currentPeriodEndISO,
                cancel_at_period_end: subscription.cancel_at_period_end || false,
              };
              
              console.log('📝 Update data:', JSON.stringify(updates, null, 2));
              
              await db.updateUserPlanWithServiceRole(userPlan.user_id, updates);
              console.log('✅ Updated subscription for user:', userPlan.user_id);
            }
          } else {
            console.error('❌ No user plan found for user:', userId);
          }
        } else {
          console.error('❌ No user ID found in subscription metadata');
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('❌ Subscription deleted:', subscription.id);
        console.log('📊 Deleted subscription data:', {
          id: subscription.id,
          status: subscription.status,
          cancel_at_period_end: subscription.cancel_at_period_end,
          ended_at: subscription.ended_at,
          canceled_at: subscription.canceled_at,
          metadata: subscription.metadata
        });
        
        // Find user by stripe subscription ID and downgrade to free plan
        const userId = subscription.metadata?.user_id;
        console.log('🆔 User ID from subscription metadata:', userId);
        
        if (userId) {
          const userPlan = await db.getUserPlanWithServiceRole(userId);
          console.log('👤 Found user plan:', !!userPlan);
          
          if (userPlan) {
            console.log('🔄 Subscription deleted, downgrading to free plan');
            const updates = {
              plan_name: 'free' as const,
              subscription_status: 'inactive' as const,
              stripe_subscription_id: null,
              stripe_price_id: null,
              current_period_start: null,
              current_period_end: null,
              cancel_at_period_end: false,
              conversation_minutes_limit: 5, // Free plan limit
              conversation_minutes_used: Math.min(userPlan.conversation_minutes_used, 5), // Cap at free limit
            };
            
            await db.updateUserPlanWithServiceRole(userPlan.user_id, updates);
            console.log('✅ Downgraded user to free plan:', userPlan.user_id);
          } else {
            console.error('❌ No user plan found for user:', userId);
          }
        } else {
          console.error('❌ No user ID found in subscription metadata');
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log('💸 Payment failed for invoice:', invoice.id);
        
        if ((invoice as any).subscription) {
          const subscription = await stripe.subscriptions.retrieve((invoice as any).subscription as string);
          const userPlan = await db.getUserPlanWithServiceRole(subscription.metadata?.user_id || '');
          
          if (userPlan) {
            await db.updateUserPlanWithServiceRole(userPlan.user_id, {
              subscription_status: 'past_due' as const,
            });
            console.log('⚠️ Marked subscription as past due for user:', userPlan.user_id);
          }
        }
        break;
      }

      default:
        console.log(`🤷‍♂️ Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('❌ Stripe webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed', details: error.message },
      { status: 500 }
    );
  }
}