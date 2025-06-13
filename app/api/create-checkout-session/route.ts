import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-05-28.basil',
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { priceId, userId } = await request.json();

    if (!priceId || !userId) {
      return NextResponse.json(
        { error: 'Missing required parameters: priceId and userId' },
        { status: 400 }
      );
    }

    // Get the app URL from the request origin or fallback to localhost
    const origin = request.headers.get('origin') || 'http://localhost:3000';
    let appUrl: string;
    
    if (process.env.NODE_ENV === 'production') {
      // Ensure production URLs have proper scheme
      if (origin.startsWith('http://') || origin.startsWith('https://')) {
        appUrl = origin;
      } else {
        appUrl = `https://${origin}`;
      }
    } else {
      appUrl = 'http://localhost:3000';
    }

    // Verify user exists
    const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId);
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Create or retrieve Stripe customer
    let customerId: string;
    
    // Check if user already has a Stripe customer ID
    const { data: existingPlan } = await supabase
      .from('user_plans')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (existingPlan?.stripe_customer_id) {
      customerId = existingPlan.stripe_customer_id;
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.user.email,
        metadata: {
          user_id: userId,
        },
      });
      customerId = customer.id;
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${appUrl}/dashboard?success=true`,
      cancel_url: `${appUrl}/pricing?canceled=true`,
      metadata: {
        user_id: userId,
      },
      subscription_data: {
        metadata: {
          user_id: userId,
        },
      },
    });

    return NextResponse.json({ 
      sessionId: session.id,
      url: session.url 
    });

  } catch (error: any) {
    console.error('❌ Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session', details: error.message },
      { status: 500 }
    );
  }
} 