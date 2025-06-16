'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import AuthForm from '@/components/auth/AuthForm'
import { motion } from 'framer-motion'
import { AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/database/auth'

// Cute quotes component
function CuteQuotes() {
  const [currentQuote, setCurrentQuote] = useState(0);
  
  const quotes = [
    "Welcome to VoiceBun! 🥟",
    "Ready to create some voice magic? ✨",
    "Let's build amazing voice agents together! 🤖",
    "Your voice journey starts here! 🎤",
    "Time to make some AI friends! 👋",
    "Welcome to the future of voice! 🚀",
    "Let's get this voice party started! 🎉",
    "Ready to chat with AI? Let's go! 💬",
    "Your voice agent adventure begins! 🌟",
    "Welcome to the VoiceBun family! 💕"
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentQuote((prev) => (prev + 1) % quotes.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [quotes.length]);

  return (
    <motion.div
      key={currentQuote}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.5 }}
      className="text-center"
    >
      <p className="text-white text-xl font-medium">
        {quotes[currentQuote]}
      </p>
    </motion.div>
  );
}

function AuthPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [oauthError, setOauthError] = useState<string | null>(null)

  // Check URL params for initial mode and OAuth errors
  useEffect(() => {
    const modeParam = searchParams.get('mode')
    const errorParam = searchParams.get('error')
    
    if (modeParam === 'signup') {
      setMode('signup')
    }
    
    if (errorParam) {
      switch (errorParam) {
        case 'oauth_error':
          setOauthError('OAuth authentication failed. Please try again.')
          break
        case 'exchange_failed':
          setOauthError('Failed to complete Google sign in. Please try again.')
          break
        case 'access_denied':
          setOauthError('Google sign in was cancelled.')
          break
        case 'no_oauth_params':
          setOauthError('Safari blocked the OAuth flow. Please try using Chrome or Firefox, or disable Safari\'s "Prevent Cross-Site Tracking" in Settings.')
          break
        default:
          setOauthError('Authentication error occurred. Please try again.')
      }
      
      // Clear the error from URL after showing it
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.delete('error')
      window.history.replaceState({}, '', newUrl.toString())
    }
  }, [searchParams])

  // Redirect if already authenticated
  useEffect(() => {
    if (user && !loading) {
      console.log('User authenticated, redirecting to dashboard')
      router.push('/dashboard')
    }
  }, [user, loading, router])

  const handleAuthSuccess = () => {
    console.log('Auth success, redirecting to dashboard')
    router.push('/dashboard')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black" style={{ 
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (user) {
    return null // Will redirect
  }

  return (
    <div className="min-h-screen flex bg-black" style={{ 
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    }}>
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 p-12 flex-col justify-center items-center">
        <div className="max-w-md text-center">
          <div className="flex items-center justify-center mb-8">
            <img 
              src="/VoiceBun-BunOnly.png" 
              alt="VoiceBun Mascot" 
              className="h-32 w-auto"
            />
          </div>
          
          <CuteQuotes />
        </div>
      </div>

      {/* Right side - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-lg">
          {/* Mobile branding */}
          <div className="lg:hidden text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <img 
                src="/VoiceBun-BunOnly.png" 
                alt="VoiceBun Mascot" 
                className="h-24 w-auto"
              />
            </div>
            <CuteQuotes />
          </div>

          {/* OAuth Error Display */}
          {oauthError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <p className="text-red-700 text-sm">{oauthError}</p>
              <button 
                onClick={() => setOauthError(null)}
                className="ml-auto text-red-500 hover:text-red-700"
              >
                ×
              </button>
            </div>
          )}

          <AuthForm 
            mode={mode} 
            onSuccess={handleAuthSuccess}
            onModeChange={setMode}
          />
        </div>
      </div>
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black" style={{ 
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    }}>
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AuthPageContent />
    </Suspense>
  )
} 