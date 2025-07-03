'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AuthForm from '@/components/auth/AuthForm'
import { useAuth } from '@/contexts/AuthContext'
import { motion } from 'framer-motion'

function AuthPageContent() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  
  console.log('🔍 AuthPageContent render:', { 
    hasUser: !!user, 
    loading, 
    mode,
    url: typeof window !== 'undefined' ? window.location.href : 'server'
  })

  // Redirect if already authenticated
  useEffect(() => {
    if (user && !loading) {
      console.log('✅ User authenticated, redirecting to home page')
      router.push('/')
    }
  }, [user, loading, router])

  const handleSuccess = () => {
    console.log('✅ Auth successful, redirecting to home page')
    window.location.href = '/'
  }

  const handleModeChange = (newMode: 'signin' | 'signup') => {
    setMode(newMode)
  }

  if (loading) {
    return (
      <div className="min-h-screen" style={{ 
        background: 'radial-gradient(circle, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 61%, rgba(33, 33, 33, 1) 100%)',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      }}>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white"></div>
        </div>
      </div>
    )
  }

  if (user) {
    return (
      <div className="min-h-screen" style={{ 
        background: 'radial-gradient(circle, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 61%, rgba(33, 33, 33, 1) 100%)',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      }}>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-lg text-white">Redirecting to home...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ 
      background: 'radial-gradient(circle, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 61%, rgba(33, 33, 33, 1) 100%)',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    }}>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Brand Header */}
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            <h1 className="text-4xl font-bold text-white mb-2" style={{ fontFamily: 'Sniglet, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
              VoiceBun
            </h1>
            <p className="text-white/80 text-lg">
              Give your idea a voice
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="w-full"
          >
            <AuthForm 
              mode={mode} 
              onSuccess={handleSuccess}
              onModeChange={handleModeChange}
            />
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default function AuthPage() {
  return <AuthPageContent />
} 