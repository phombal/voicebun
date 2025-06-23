'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useAuth } from '@/contexts/AuthContext'
import { useDatabase } from '@/hooks/useDatabase'
import { UserPlan } from '@/lib/database/types'
import { User, LogOut, ChevronDown, CreditCard } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function UserProfile() {
  const { user, signOut } = useAuth()
  const { getUserPlan } = useDatabase()
  const [isOpen, setIsOpen] = useState(false)
  const [upgrading, setUpgrading] = useState(false)
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null)
  const [planLoading, setPlanLoading] = useState(true)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadUserPlan = useCallback(async () => {
    if (!user) return
    
    try {
      setPlanLoading(true)
      const plan = await getUserPlan()
      setUserPlan(plan)
    } catch (err: any) {
      console.error('Error loading user plan in UserProfile:', err)
    } finally {
      setPlanLoading(false)
    }
  }, [user, getUserPlan])

  useEffect(() => {
    loadUserPlan()
  }, [loadUserPlan])

  const handleSignOut = async () => {
    await signOut()
    setIsOpen(false)
  }

  const handleUpgrade = async () => {
    if (!user) {
      console.error('No user found');
      return;
    }
    
    setUpgrading(true);
    
    try {
      // Use API checkout session for proper user_id metadata
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: 'price_1RaWUdKVSt22QP5GygmOGHou', // Live Professional plan price ID
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to create checkout session');
      }
    } catch (error) {
      console.error('Error upgrading:', error);
      alert('Failed to start upgrade process. Please try again.');
      setUpgrading(false);
    }
  };

  if (!user) return null

  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
  const initials = displayName
    .split(' ')
    .map((name: string) => name[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  // Check if user should see upgrade option (only for free plan users)
  const shouldShowUpgrade = !planLoading && userPlan?.plan_name === 'free'

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 bg-gray-700 hover:bg-gray-600 rounded-lg px-3 py-2 transition-colors"
      >
        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
          {user.user_metadata?.avatar_url ? (
            <Image 
              src={user.user_metadata.avatar_url} 
              alt={displayName}
              width={32}
              height={32}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            initials
          )}
        </div>
        <span className="text-white text-sm font-medium hidden sm:block">
          {displayName}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50">
          <div className="px-4 py-3 border-b border-gray-200">
            <p className="text-gray-900 font-medium">{displayName}</p>
            <p className="text-gray-500 text-sm">{user.email}</p>
          </div>
          
          <div className="py-2">
            <button
              onClick={() => {
                router.push('/profile')
                setIsOpen(false)
              }}
              className="w-full flex items-center px-4 py-2 text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              <User className="w-4 h-4 mr-3" />
              Profile Settings
            </button>
            
            {/* Only show upgrade button for free plan users */}
            {shouldShowUpgrade && (
              <button
                onClick={handleUpgrade}
                disabled={upgrading}
                className="w-full flex items-center px-4 py-2 text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CreditCard className="w-4 h-4 mr-3" />
                {upgrading ? 'Processing...' : 'Upgrade Plan'}
              </button>
            )}
          </div>
          
          <div className="border-t border-gray-200 pt-2">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center px-4 py-2 text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
            >
              <LogOut className="w-4 h-4 mr-3" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  )
} 