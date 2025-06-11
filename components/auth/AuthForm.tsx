'use client'

import { useState } from 'react'
import { auth } from '@/lib/database/auth'
import { Eye, EyeOff, Mail, Lock, User, Loader2 } from 'lucide-react'

interface AuthFormProps {
  mode: 'login' | 'signup'
  onSuccess?: () => void
  onModeChange?: (mode: 'login' | 'signup') => void
}

export default function AuthForm({ mode, onSuccess, onModeChange }: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    try {
      if (mode === 'signup') {
        const { data, error } = await auth.signUp(email, password, fullName)
        
        if (error) {
          setError(error.message)
        } else if (data.user && !data.session) {
          setMessage('Please check your email to confirm your account before signing in.')
        } else {
          setMessage('Account created successfully!')
          onSuccess?.()
        }
      } else {
        const { error } = await auth.signIn(email, password)
        
        if (error) {
          setError(error.message)
        } else {
          setMessage('Signed in successfully!')
          onSuccess?.()
        }
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto" style={{ 
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    }}>
      <div className="bg-gray-900/95 backdrop-blur-md border border-gray-700/50 rounded-3xl shadow-2xl shadow-black/40 p-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2" style={{ 
            fontFamily: 'Sniglet, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' 
          }}>
            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="text-gray-300 text-lg">
            {mode === 'login' 
              ? 'Sign in to your voice assistant account' 
              : 'Get started with your voice assistant'
            }
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {mode === 'signup' && (
            <div>
              <label htmlFor="fullName" className="block text-sm font-semibold text-gray-200 mb-3">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-gray-800/50 border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
                  placeholder="Enter your full name"
                  required={mode === 'signup'}
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-gray-200 mb-3">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-gray-800/50 border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
                placeholder="Enter your email"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-semibold text-gray-200 mb-3">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-14 py-4 bg-gray-800/50 border border-gray-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200"
                placeholder="Enter your password"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {mode === 'signup' && (
              <p className="text-xs text-gray-400 mt-2">
                Password must be at least 6 characters long
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-500/50 rounded-xl p-4 backdrop-blur-sm">
              <p className="text-red-200 text-sm">{error}</p>
            </div>
          )}

          {message && (
            <div className="bg-green-900/50 border border-green-500/50 rounded-xl p-4 backdrop-blur-sm">
              <p className="text-green-200 text-sm">{message}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full text-black font-semibold py-4 px-6 rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg disabled:transform-none disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center"
            style={{ 
              background: loading ? 'rgba(75, 85, 99, 0.8)' : 'rgb(255, 255, 255)',
              boxShadow: loading ? 'none' : '0 10px 25px rgba(24, 0, 121, 0.3)'
            }}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                {mode === 'login' ? 'Signing In...' : 'Creating Account...'}
              </>
            ) : (
              mode === 'login' ? 'Sign In' : 'Create Account'
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-gray-300">
            {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => onModeChange?.(mode === 'login' ? 'signup' : 'login')}
              className="text-white font-semibold hover:underline transition-all duration-200"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
} 