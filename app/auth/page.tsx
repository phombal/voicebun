'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import AuthForm from '@/components/auth/AuthForm'
import { Sparkles, Code, MessageSquare } from 'lucide-react'

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
      router.push('/')
    }
  }, [user, loading, router])

  const handleAuthSuccess = () => {
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ 
        background: 'linear-gradient(to bottom, rgb(24, 0, 121), rgb(255, 106, 0))',
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
    <div className="min-h-screen flex" style={{ 
      background: 'linear-gradient(to bottom, rgb(24, 0, 121), rgb(255, 106, 0))',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    }}>
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 p-12 flex-col justify-center">
        <div className="max-w-md">
          <div className="flex items-center justify-center mb-8">
            <img 
              src="/VoiceBun-White.png" 
              alt="VoiceBun Logo" 
              className="h-20 w-auto"
            />
          </div>
          
          <h2 className="text-4xl font-bold text-white mb-6 text-center" style={{ 
            fontFamily: 'Sniglet, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' 
          }}>
            Welcome to the VoiceBun Community
          </h2>
          
          
        </div>
      </div>

      {/* Right side - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile branding */}
          <div className="lg:hidden text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <img 
                src="/VoiceBun-White.png" 
                alt="VoiceBun Logo" 
                className="h-16 w-auto"
              />
            </div>
            <p className="text-white/80 text-lg">Build powerful voice agents with AI</p>
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
    <div className="min-h-screen flex items-center justify-center" style={{ 
      background: 'linear-gradient(to bottom, rgb(24, 0, 121), rgb(255, 106, 0))',
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