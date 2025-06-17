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
      'Provision 1 phone number',
      'Access to community support'
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
      'Provision 5 phone numbers',
      'Access to dedicated support'
    ],
    popular: true,
    stripePriceId: 'price_1RaWUdKVSt22QP5GygmOGHou',
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
      'Unlimited phone numbers',
      'White-label solution',
      '24/7 phone support',
      'SLA guarantee',
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
        // For testing, redirect directly to the test Stripe link
        window.location.href = 'https://buy.stripe.com/test_eVq14gbe72Iv6F44M2fYY00';
        return;
        
        // Original API approach (commented out for testing)
        /*
        const response = await fetch('/api/create-checkout-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            priceId: 'price_1RaWUdKVSt22QP5GygmOGHou', // Professional plan price ID
            userId: user.id,
          }),
        });

        const data = await response.json();

        if (data.url) {
          window.location.href = data.url;
        } else {
          throw new Error(data.error || 'Failed to create checkout session');
        }
        return;
        */
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
              className={`
                relative bg-gray-900 border border-gray-800 rounded-2xl p-8 
                ${plan.popular ? 'ring-2 ring-white' : ''}
                hover:border-gray-700 transition-all duration-300
              `}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div className="bg-white text-black px-4 py-1 rounded-full text-sm font-medium">
                    Most Popular
                  </div>
                </div>
              )}
              
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                <p className="text-gray-400 mb-4">{plan.description}</p>
                <div className="mb-4">
                  <span className="text-4xl font-bold text-white">
                    {getCurrentPrice(plan)}
                  </span>
                  <span className="text-gray-400 ml-1">/{plan.interval}</span>
                </div>
                <p className="text-gray-400 text-sm">{plan.callMinutes}</p>
              </div>

              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-5 h-5 bg-white rounded-full flex items-center justify-center mt-0.5">
                      <svg className="w-3 h-3 text-black" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span className="text-gray-300">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribe(plan)}
                className={`
                  w-full py-3 px-6 rounded-lg font-medium transition-all duration-300
                  ${plan.buttonStyle === 'primary' 
                    ? 'bg-white text-black hover:bg-gray-100' 
                    : plan.buttonStyle === 'secondary'
                    ? 'bg-gray-800 text-white hover:bg-gray-700 border border-gray-700'
                    : 'border border-white text-white hover:bg-white hover:text-black'
                  }
                `}
              >
                {plan.buttonText}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}