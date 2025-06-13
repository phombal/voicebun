'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import AuthForm from '@/components/auth/AuthForm'
import { motion } from 'framer-motion'

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

  // Check URL params for initial mode
  useEffect(() => {
    const modeParam = searchParams.get('mode')
    if (modeParam === 'signup') {
      setMode('signup')
    }
  }, [searchParams])

  // Redirect if already authenticated
  useEffect(() => {
    if (user && !loading) {
      router.push('/dashboard')
    }
  }, [user, loading, router])

  const handleAuthSuccess = () => {
    router.push('/dashboard')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black" style={{ 
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      }}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
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