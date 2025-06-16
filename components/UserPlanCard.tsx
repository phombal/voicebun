'use client';

import { useState, useEffect } from 'react';
import { useDatabase } from '@/hooks/useDatabase';
import { UserPlan } from '@/lib/database/types';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function UserPlanCard() {
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getUserPlan } = useDatabase();
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    loadUserPlan();
  }, []);

  const loadUserPlan = async () => {
    try {
      setLoading(true);
      const plan = await getUserPlan();
      console.log('🔍 Loaded user plan:', plan);
      console.log('📋 Plan name:', plan?.plan_name);
      console.log('📊 Plan status:', plan?.subscription_status);
      setUserPlan(plan);
    } catch (err: any) {
      console.error('Error loading user plan:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async () => {
    if (!user) return;

    try {
      setUpgrading(true);

      // Redirect directly to the specified Stripe buy link
      window.location.href = 'https://buy.stripe.com/9B600ka5h6698qwgLcbsc01';
    } catch (error) {
      console.error('Error upgrading:', error);
      alert('Failed to start upgrade process. Please try again.');
      setUpgrading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!user || !userPlan) return;

    const confirmed = window.confirm(
      'Are you sure you want to cancel your subscription? You\'ll continue to have access until the end of your current billing period.'
    );

    if (!confirmed) return;

    try {
      setCanceling(true);

      const response = await fetch('/api/cancel-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel subscription');
      }

      // Refresh the user plan data
      await loadUserPlan();
      
      alert('Your subscription has been scheduled for cancellation at the end of your current billing period.');
    } catch (error) {
      console.error('Error canceling subscription:', error);
      alert('Failed to cancel subscription. Please try again.');
    } finally {
      setCanceling(false);
    }
  };

  const handleReactivateSubscription = async () => {
    if (!user || !userPlan) return;

    try {
      setReactivating(true);

      const response = await fetch('/api/reactivate-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reactivate subscription');
      }

      // Refresh the user plan data
      await loadUserPlan();
      
      alert('Your subscription has been reactivated!');
    } catch (error) {
      console.error('Error reactivating subscription:', error);
      alert('Failed to reactivate subscription. Please try again.');
    } finally {
      setReactivating(false);
    }
  };

  const getUsagePercentage = () => {
    if (!userPlan) return 0;
    return Math.min((userPlan.conversation_minutes_used / userPlan.conversation_minutes_limit) * 100, 100);
  };

  const getUsageColor = () => {
    const percentage = getUsagePercentage();
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getPlanDisplayName = (planName: string) => {
    switch (planName) {
      case 'free':
        return 'Free';
      case 'professional':
        return 'Professional';
      case 'enterprise':
        return 'Enterprise';
      default:
        return planName;
    }
  };

  const getPlanColor = (planName: string) => {
    switch (planName) {
      case 'free':
        return 'bg-gray-500';
      case 'professional':
        return 'bg-blue-500';
      case 'enterprise':
        return 'bg-purple-500';
      default:
        return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-white/10 rounded w-1/4 mb-4"></div>
          <div className="h-8 bg-white/10 rounded w-1/2 mb-4"></div>
          <div className="h-4 bg-white/10 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-red-400 mb-2">Error Loading Plan</h3>
        <p className="text-red-300 text-sm">{error}</p>
        <button
          onClick={loadUserPlan}
          className="mt-4 px-4 py-2 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!userPlan) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-2">No Plan Found</h3>
        <p className="text-white/70 text-sm mb-4">
          We couldn't find your subscription plan. This might be a temporary issue.
        </p>
        <button
          onClick={handleUpgrade}
          disabled={upgrading}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {upgrading ? 'Processing...' : 'Upgrade to Professional'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`w-3 h-3 rounded-full ${getPlanColor(userPlan.plan_name)}`}></div>
          <h3 className="text-lg font-semibold text-white">
            {getPlanDisplayName(userPlan.plan_name)} Plan
          </h3>
        </div>
        <div className="flex items-center space-x-2">
          {/* Debug refresh button */}
          <button
            onClick={loadUserPlan}
            className="px-2 py-1 bg-gray-500/20 text-gray-300 text-xs rounded hover:bg-gray-500/30 transition-colors"
            title="Refresh plan data"
          >
            🔄
          </button>
          
          {/* Action buttons based on plan status */}
          {userPlan.plan_name === 'free' ? (
            <button
              onClick={handleUpgrade}
              disabled={upgrading}
              className="px-3 py-1 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {upgrading ? 'Processing...' : 'Upgrade'}
            </button>
          ) : userPlan.subscription_status === 'active' ? (
            <>
              {userPlan.cancel_at_period_end ? (
                <button
                  onClick={handleReactivateSubscription}
                  disabled={reactivating}
                  className="px-3 py-1 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reactivating ? 'Processing...' : 'Reactivate'}
                </button>
              ) : (
                <button
                  onClick={handleCancelSubscription}
                  disabled={canceling}
                  className="px-3 py-1 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {canceling ? 'Processing...' : 'Cancel'}
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Usage Statistics */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-white/70 text-sm">Conversation Minutes</span>
          <span className="text-white text-sm">
            {userPlan.conversation_minutes_used} / {userPlan.conversation_minutes_limit}
          </span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${getUsageColor()}`}
            style={{ width: `${getUsagePercentage()}%` }}
          ></div>
        </div>
        {getUsagePercentage() >= 90 && (
          <p className="text-yellow-400 text-xs mt-2">
            ⚠️ You're running low on conversation minutes
          </p>
        )}
      </div>

      {/* Subscription Status */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-white/70">Status</span>
        <div className="text-right">
          <span className={`capitalize ${
            userPlan.subscription_status === 'active' 
              ? 'text-green-400' 
              : userPlan.subscription_status === 'past_due'
              ? 'text-yellow-400'
              : 'text-white/70'
          }`}>
            {userPlan.subscription_status}
          </span>
          {userPlan.cancel_at_period_end && (
            <div className="text-xs text-orange-400 mt-1">
              Cancels at period end
            </div>
          )}
        </div>
      </div>

      {/* Next Billing Date or Cancellation Date */}
      {userPlan.current_period_end && userPlan.subscription_status === 'active' && (
        <div className="flex items-center justify-between text-sm mt-2">
          <span className="text-white/70">
            {userPlan.cancel_at_period_end ? 'Access Until' : 'Next Billing'}
          </span>
          <span className={`${userPlan.cancel_at_period_end ? 'text-orange-400' : 'text-white/70'}`}>
            {new Date(userPlan.current_period_end).toLocaleDateString()}
          </span>
        </div>
      )}

      {/* Plan Features */}
      <div className="mt-4 pt-4 border-t border-white/10">
        <h4 className="text-white font-medium text-sm mb-2">Plan Features</h4>
        <ul className="space-y-1 text-xs text-white/70">
          {userPlan.plan_name === 'free' && (
            <>
              <li>• 5 conversation minutes/month</li>
              <li>• 1 voice agent</li>
              <li>• Basic support</li>
            </>
          )}
          {userPlan.plan_name === 'professional' && (
            <>
              <li>• 400 conversation minutes/month</li>
              <li>• Unlimited voice agents</li>
              <li>• Priority support</li>
              <li>• Advanced analytics</li>
            </>
          )}
          {userPlan.plan_name === 'enterprise' && (
            <>
              <li>• Unlimited conversation minutes</li>
              <li>• Unlimited voice agents</li>
              <li>• 24/7 dedicated support</li>
              <li>• Custom integrations</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
} 