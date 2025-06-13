import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { db } from '@/lib/database/service';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-05-28.basil',
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const headersList = headers();
    const sig = headersList.get('stripe-signature')!;

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
    } catch (err: any) {
      console.error('⚠️ Webhook signature verification failed:', err.message);
      return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
    }

    console.log('🎯 Stripe webhook event received:', event.type);

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('💳 Checkout session completed:', session.id);
        
        if (session.mode === 'subscription' && session.customer && session.subscription) {
          // Get the subscription details
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          const customer = await stripe.customers.retrieve(session.customer as string);
          
          // Extract user ID from metadata (you'll need to pass this when creating the checkout session)
          const userId = session.metadata?.user_id;
          
          if (userId) {
            // Update or create user plan
            const planData = {
              plan_name: 'professional' as const,
              subscription_status: 'active' as const,
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: session.subscription as string,
              stripe_price_id: subscription.items.data[0]?.price.id || null,
              current_period_start: new Date((subscription as any).current_period_start * 1000).toISOString(),
              current_period_end: new Date((subscription as any).current_period_end * 1000).toISOString(),
              cancel_at_period_end: (subscription as any).cancel_at_period_end,
              conversation_minutes_used: 0,
              conversation_minutes_limit: 400, // Professional plan limit
            };

            try {
              // Try to update existing plan first
              await db.updateUserPlanWithServiceRole(userId, planData);
              console.log('✅ Updated existing user plan for user:', userId);
            } catch (error) {
              // If no existing plan, create a new one
              await db.createUserPlanWithServiceRole(userId, planData);
              console.log('✅ Created new user plan for user:', userId);
            }
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('🔄 Subscription updated:', subscription.id);
        
        // Find user by stripe subscription ID
        const userPlan = await db.getUserPlanWithServiceRole(subscription.metadata?.user_id || '');
        
        if (userPlan) {
          const updates = {
            subscription_status: (subscription as any).status as any,
            current_period_start: new Date((subscription as any).current_period_start * 1000).toISOString(),
            current_period_end: new Date((subscription as any).current_period_end * 1000).toISOString(),
            cancel_at_period_end: (subscription as any).cancel_at_period_end,
          };
          
          await db.updateUserPlanWithServiceRole(userPlan.user_id, updates);
          console.log('✅ Updated subscription for user:', userPlan.user_id);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('❌ Subscription cancelled:', subscription.id);
        
        // Find user by stripe subscription ID and downgrade to free plan
        const userPlan = await db.getUserPlanWithServiceRole(subscription.metadata?.user_id || '');
        
        if (userPlan) {
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