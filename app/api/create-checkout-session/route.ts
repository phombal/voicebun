import { supabaseServiceRole } from '@/lib/database/auth';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-05-28.basil',
});

export async function POST(request: NextRequest) {
  try {
    const { priceId, userId } = await request.json();

    if (!priceId || !userId) {
      return NextResponse.json(
        { error: 'Price ID and User ID are required' },
        { status: 400 }
      );
    }

    console.log('🛒 Creating checkout session for:', { priceId, userId });

    // Get user details from database
    const { data: userData, error: userError } = await supabaseServiceRole.auth.admin.getUserById(userId);
    
    if (userError || !userData.user) {
      console.error('❌ Error fetching user:', userError);
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const userEmail = userData.user.email;
    console.log('👤 User email:', userEmail);

    // Look for existing Stripe customer or create one
    let customerId: string;
    try {
      console.log('🔍 Looking for existing Stripe customer with email:', userEmail);
      const existingCustomers = await stripe.customers.list({
        email: userEmail,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id;
        console.log('✅ Found existing Stripe customer:', customerId);
        
        // Update customer metadata to include user_id
        await stripe.customers.update(customerId, {
          metadata: {
            user_id: userId,
          },
        });
        console.log('✅ Updated customer metadata with user_id');
      } else {
        console.log('📝 Creating new Stripe customer');
        const customer = await stripe.customers.create({
          email: userEmail,
          metadata: {
            user_id: userId,
          },
        });
        customerId = customer.id;
        console.log('✅ Created new Stripe customer:', customerId);
      }
    } catch (customerError) {
      console.error('❌ Error handling Stripe customer:', customerError);
      return NextResponse.json(
        { error: 'Failed to handle customer' },
        { status: 500 }
      );
    }

    // Construct the app URL based on the request origin
    let appUrl: string;
    const origin = request.headers.get('origin');
    
    if (process.env.NODE_ENV === 'production') {
      // In production, ensure we have https
      if (origin && (origin.startsWith('http://') || origin.startsWith('https://'))) {
        appUrl = origin;
      } else if (origin) {
        appUrl = `https://${origin}`;
      } else {
        // Fallback to your production domain
        appUrl = 'https://your-production-domain.com';
      }
    } else {
      // Development fallback
      appUrl = origin || 'http://localhost:3000';
    }

    console.log('🌐 App URL:', appUrl);

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId, // Use customer ID instead of customer_email
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${appUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/dashboard`,
      metadata: {
        user_id: userId,
      },
    });

    console.log('✅ Checkout session created:', session.id);

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error: any) {
    console.error('❌ Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session', details: error.message },
      { status: 500 }
    );
  }
} 
 