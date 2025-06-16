'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/database/auth';
import { Check } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

interface PricingPlan {
  id: string;
  name: string;
  description: string;
  price: number | string;
  interval: string;
  features: string[];
  popular?: boolean;
  stripePriceId: string;
  buttonText: string;
  buttonStyle: 'primary' | 'secondary' | 'outline';
  callMinutes: string;
}

const plans: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'For individuals who want to try out the most advanced AI voice agent',
    price: 0,
    interval: 'month',
    callMinutes: '5 minutes/month',
    features: [
      'Voice agent creation',
      'Phone number provisioning'
    ],
    stripePriceId: '',
    buttonText: 'Get Started for Free',
    buttonStyle: 'outline'
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'For businesses creating premium voice agents for their customers',
    price: 20,
    interval: 'month',
    callMinutes: '400 minutes/month',
    features: [
      'Everything in Free, plus',
      'Unlimited voice agent projects'
    ],
    popular: true,
    stripePriceId: 'price_1QdVJhRuWKCS4zq4oGJvhzpF',
    buttonText: 'Get Started',
    buttonStyle: 'primary'
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large organizations with custom voice agent needs',
    price: 'Custom',
    interval: '',
    callMinutes: 'Unlimited minutes',
    features: [
      'Everything in Professional, plus',
      'White-label solution',
      'Dedicated account manager',
      '24/7 phone support',
      'SLA guarantee',
      'On-premise deployment',
      'Custom voice models'
    ],
    stripePriceId: 'price_enterprise_monthly',
    buttonText: 'Contact Sales',
    buttonStyle: 'outline'
  },
];

export default function PricingPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const router = useRouter();

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
      router.push('/auth?mode=signup');
      return;
    }

    // Skip processing for free plan
    if (plan.id === 'free') {
      return;
    }

    setProcessingPlan(plan.id);

    try {
      // For the specific plan that should redirect to the Stripe buy link
      if (plan.id === 'professional') {
        // Redirect directly to the specified Stripe buy link
        window.location.href = 'https://buy.stripe.com/9B600ka5h6698qwgLcbsc01';
        return;
      }

      // For other plans, use the existing API flow
      const priceId = plan.stripePriceId;
      
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: priceId,
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

  const getCurrentPrice = (plan: PricingPlan) => {
    if (typeof plan.price === 'string') return plan.price;
    return plan.price;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      {/* Header */}
      <header className="">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link href="/">
              <Image
                src="/VoiceBun-White.png"
                alt="VoiceBun"
                width={120}
                height={40}
                className="h-10 w-auto cursor-pointer"
              />
            </Link>
          </div>
          <div className="flex items-center space-x-6">
            <Link
              href="/pricing"
              className="text-gray-300 hover:text-white transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/auth"
              className="text-gray-300 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/auth?mode=signup"
              className="bg-white text-black px-4 py-2 rounded-lg font-medium hover:bg-gray-100 transition-colors"
            >
              Get Started for Free
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
            Create and deploy voice agents with flexible pricing for every need
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <div 
              key={plan.id} 
              className={`relative bg-gray-900/50 border rounded-2xl p-6 transition-all duration-200 hover:bg-gray-900/70 ${
                plan.popular 
                  ? 'border-white shadow-lg shadow-white/10' 
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-white text-black px-4 py-1 rounded-full text-xs font-medium">
                  Most Popular
                </div>
              )}
              
              {/* Plan Header */}
              <div className="mb-6">
                <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                <p className="text-gray-400 mb-4 leading-relaxed text-sm">{plan.description}</p>
                
                {/* Call Minutes - Made More Prominent */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 mb-4 text-center">
                  <div className="text-base font-bold text-white mb-1">
                    {plan.callMinutes}
                  </div>
                  <div className="text-xs text-gray-400">
                    Voice conversation time
                  </div>
                </div>
                
                {/* Price */}
                <div className="mb-6">
                  <div className="flex items-baseline mb-2">
                    <span className="text-4xl font-bold text-white">
                      {typeof getCurrentPrice(plan) === 'number' ? `$${getCurrentPrice(plan)}` : getCurrentPrice(plan)}
                    </span>
                    {plan.interval && (
                      <span className="text-gray-400 ml-2">
                        /{plan.interval}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Features */}
              <div className="space-y-3 mb-6">
                {plan.features.map((feature, featureIndex) => (
                  <div key={featureIndex} className="flex items-start gap-3">
                    <Check className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-300 leading-relaxed text-sm">{feature}</span>
                  </div>
                ))}
              </div>

              {/* CTA Button */}
              <button
                className={`w-full py-3 px-6 rounded-lg font-medium transition-all duration-200 ${
                  plan.buttonStyle === 'primary'
                    ? 'bg-white text-black hover:bg-gray-100'
                    : 'border border-gray-600 text-white hover:border-gray-400 hover:bg-gray-800/50'
                } ${processingPlan === plan.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => handleSubscribe(plan)}
                disabled={processingPlan === plan.id}
              >
                {processingPlan === plan.id ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                    Processing...
                  </div>
                ) : (
                  plan.buttonText
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-12">
        </div>
      </div>
    </div>
  );
} 