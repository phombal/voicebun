'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/database/auth';
import { Check, Zap, Crown, Building } from 'lucide-react';

interface PricingPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  interval: string;
  features: string[];
  popular?: boolean;
  stripePriceId: string;
}

const plans: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Perfect for trying out our voice agent platform',
    price: 0,
    interval: 'month',
    features: [
      '5 conversation minutes per month',
      '1 voice agent project',
      'Basic voice customization',
      'Email support',
      'Community access'
    ],
    stripePriceId: '',
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'Ideal for businesses and power users',
    price: 29,
    interval: 'month',
    features: [
      '400 conversation minutes per month',
      'Unlimited voice agent projects',
      'Advanced voice customization',
      'Priority email support',
      'Analytics dashboard',
      'Custom integrations',
      'Phone number provisioning'
    ],
    popular: true,
    stripePriceId: 'price_1QdVJhRuWKCS4zq4oGJvhzpF',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large organizations with custom needs',
    price: 99,
    interval: 'month',
    features: [
      'Unlimited conversation minutes',
      'Unlimited voice agent projects',
      'White-label solution',
      'Dedicated account manager',
      '24/7 phone support',
      'Custom integrations',
      'SLA guarantee',
      'On-premise deployment option'
    ],
    stripePriceId: 'price_enterprise_monthly',
  },
];

export default function PricingPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);

  useEffect(() => {
    // Get initial user
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };

    getUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubscribe = async (plan: PricingPlan) => {
    if (!user) {
      // Redirect to sign up
      window.location.href = '/auth/signup';
      return;
    }

    if (plan.id === 'free') {
      // Free plan - no payment needed
      return;
    }

    setProcessingPlan(plan.id);

    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: plan.stripePriceId,
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (data.sessionId) {
        // Redirect to Stripe Checkout
        const stripe = (window as any).Stripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
        await stripe.redirectToCheckout({
          sessionId: data.sessionId,
        });
      } else {
        throw new Error(data.error || 'Failed to create checkout session');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      alert('Failed to start checkout process. Please try again.');
    } finally {
      setProcessingPlan(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto px-4 py-16 max-w-7xl">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Select the perfect plan for your voice agent needs. Upgrade or downgrade at any time.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan) => (
            <div 
              key={plan.id} 
              className={`relative bg-white rounded-2xl shadow-lg transition-all duration-300 hover:shadow-xl ${
                plan.popular ? 'ring-2 ring-blue-500 shadow-2xl scale-105' : ''
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                  Most Popular
                </div>
              )}
              
              <div className="p-8">
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  <p className="text-gray-600 mb-4">{plan.description}</p>
                  <div className="mb-4">
                    <span className="text-4xl font-bold text-gray-900">${plan.price}</span>
                    <span className="text-gray-600">/{plan.interval}</span>
                  </div>
                </div>

                <div className="space-y-4 mb-8">
                  {plan.features.map((feature, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{feature}</span>
                    </div>
                  ))}
                </div>

                <button
                  className={`w-full py-3 px-6 rounded-lg font-medium transition-colors ${
                    plan.popular 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  } ${processingPlan === plan.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => handleSubscribe(plan)}
                  disabled={processingPlan === plan.id}
                >
                  {processingPlan === plan.id ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                      Processing...
                    </div>
                  ) : plan.id === 'free' ? (
                    'Get Started Free'
                  ) : user ? (
                    'Subscribe Now'
                  ) : (
                    'Sign Up to Subscribe'
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-16">
          <p className="text-gray-600 mb-4">
            All plans include a 14-day free trial. No credit card required for the free plan.
          </p>
          <p className="text-sm text-gray-500">
            Need a custom solution? <a href="mailto:support@voiceagent.com" className="text-blue-600 hover:underline">Contact us</a>
          </p>
        </div>
      </div>
    </div>
  );
} 