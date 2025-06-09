'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import AuthForm from '@/components/auth/AuthForm'
import { Mic, Sparkles, Code, MessageSquare } from 'lucide-react'

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
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (user) {
    return null // Will redirect
  }

  return (
    <div className="min-h-screen bg-gray-900 flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 to-purple-700 p-12 flex-col justify-center">
        <div className="max-w-md">
          <div className="flex items-center mb-8">
            <div className="bg-white/20 rounded-full p-3 mr-4">
              <Mic className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white">Voice Assistant</h1>
          </div>
          
          <h2 className="text-4xl font-bold text-white mb-6">
            Build Powerful Voice Agents with AI
          </h2>
          
          <p className="text-xl text-blue-100 mb-8">
            Create, customize, and deploy intelligent voice assistants with our intuitive platform.
          </p>
          
          <div className="space-y-4">
            <div className="flex items-center text-blue-100">
              <Sparkles className="w-5 h-5 mr-3 text-yellow-300" />
              <span>AI-powered conversation flows</span>
            </div>
            <div className="flex items-center text-blue-100">
              <Code className="w-5 h-5 mr-3 text-green-300" />
              <span>Real-time code generation</span>
            </div>
            <div className="flex items-center text-blue-100">
              <MessageSquare className="w-5 h-5 mr-3 text-purple-300" />
              <span>Interactive chat interface</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile branding */}
          <div className="lg:hidden text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-blue-600 rounded-full p-3 mr-3">
                <Mic className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">Voice Assistant</h1>
            </div>
            <p className="text-gray-400">Build powerful voice agents with AI</p>
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
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
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