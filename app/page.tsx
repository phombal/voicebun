"use client";

import PublicNavigation from "@/components/PublicNavigation";
import CommunityProjectsSection from "@/components/CommunityProjectsSection";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { clientDb } from '@/lib/database/client-service';
import { LoadingBun } from '@/components/LoadingBun';

function isSafari() {
  if (typeof window === 'undefined') return false
  const userAgent = window.navigator.userAgent.toLowerCase()
  return userAgent.includes('safari') && !userAgent.includes('chrome')
}

function LandingPageContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [prompt, setPrompt] = useState("");
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showManualOverride, setShowManualOverride] = useState(false);

  // Debug logging for loading state
  useEffect(() => {
    console.log('🏠 LandingPage state update:', {
      loading,
      hasUser: !!user,
      userId: user?.id,
      isRedirecting,
      isSafariBrowser: isSafari(),
      environment: process.env.NODE_ENV,
      url: typeof window !== 'undefined' ? window.location.href : 'server',
      searchParams: typeof window !== 'undefined' ? window.location.search : 'server'
    });
  }, [loading, user, isRedirecting]);

  // Show manual override after extended loading
  useEffect(() => {
    if (loading && !user) {
      const overrideTimeout = setTimeout(() => {
        console.log('⏰ Showing manual override button due to extended loading');
        setShowManualOverride(true);
      }, 5000); // Show override after 5 seconds

      return () => clearTimeout(overrideTimeout);
    } else {
      setShowManualOverride(false);
    }
  }, [loading, user]);

  // Get user plan data if authenticated (non-blocking)
  useEffect(() => {
    if (user && !loading) {
      clientDb.getUserPlan()
        .then(plan => {
          if (plan) {
            // User plan data loaded but not used in UI
          }
        })
        .catch(err => console.warn('Failed to fetch user plan:', err));
    }
  }, [user, loading]);

  // Handle OAuth completion from callback
  useEffect(() => {
    const code = searchParams?.get('code');
    const error = searchParams?.get('error');
    
    console.log('🏠 Landing page OAuth check:', {
      hasCode: !!code,
      hasError: !!error,
      hasUser: !!user,
      loading,
      isSafariBrowser: isSafari(),
      environment: process.env.NODE_ENV,
      url: window.location.href
    });
    
    if (error) {
      console.error('OAuth error on landing page:', error);
      // Redirect to auth page with error
      router.push(`/auth?error=${encodeURIComponent(error)}`);
      return;
    }
    
    // If we have a code, the AuthContext should handle it via checkOAuthCompletion
    // Just wait for the user state to update
    if (code) {
      console.log('🔄 OAuth code detected, waiting for AuthContext to process...');
    }
  }, [searchParams, router, user, loading]);

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (!loading && user) {
      console.log('✅ User authenticated, redirecting to dashboard:', {
        userId: user.id,
        email: user.email,
        isSafariBrowser: isSafari(),
        environment: process.env.NODE_ENV
      });
      setIsRedirecting(true);
      router.push('/dashboard');
      return;
    }

    // Special handling for Safari - sometimes needs extra time in production
    if (isSafari() && !user && !loading) {
      console.log('🍎 Safari user without authentication detected');
      
      // In production, give Safari a bit more time to complete auth
      if (process.env.NODE_ENV === 'production') {
        console.log('🍎 Production Safari: Waiting additional time for auth completion...');
        const safariTimeout = setTimeout(() => {
          console.log('🍎 Safari production timeout completed, checking auth state:', {
            hasUser: !!user,
            loading,
            url: window.location.href
          });
        }, 1000);
        
        return () => clearTimeout(safariTimeout);
      }
    }
  }, [user, loading, router]);

  const handleSubmit = () => {
    if (!prompt.trim()) return;
    
    if (!user) {
      // Show auth prompt
      setShowAuthPrompt(true);
    } else {
      // User is authenticated, redirect to dashboard with prompt
      router.push(`/dashboard?prompt=${encodeURIComponent(prompt.trim())}`);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const examplePrompts = [
    "A customer service representative for an e-commerce company",
    "A language tutor that helps practice conversational Spanish", 
    "A meeting assistant that takes notes and schedules follow-ups",
    "A healthcare helper that provides wellness tips and reminders"
  ];

  const handleManualOverride = () => {
    console.log('🔧 Manual override triggered by user');
    setShowManualOverride(false);
    
    // Check if we have an OAuth code to handle
    const code = searchParams?.get('code');
    if (code) {
      console.log('🔄 Manual override: Attempting to handle OAuth code');
      // Redirect to dashboard and let it handle the auth
      router.push('/dashboard');
    } else {
      // No code, go to auth page
      console.log('🔄 Manual override: No OAuth code, going to auth page');
      router.push('/auth');
    }
  };

  // Show loading state
  if (loading || isRedirecting) {
    return (
      <LoadingBun 
        message={
          isRedirecting 
            ? 'Redirecting to dashboard...' 
            : loading 
              ? 'Loading your session...' 
              : 'Preparing your experience...'
        }
      />
    );
  }

  // Show landing page for unauthenticated users
  return (
    <>
      {/* Header */}
      <PublicNavigation />
      
      <div className="min-h-screen" style={{ 
        background: 'radial-gradient(circle, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 61%, rgba(33, 33, 33, 1) 100%)',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      }}>
        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-32 sm:pt-40 pb-16 sm:pb-20">
          <div className="text-center">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
                className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white mb-4 sm:mb-6 leading-tight"
                style={{ fontFamily: 'Sniglet, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}
            >
              Give your idea a voice
            </motion.h1>
            
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg sm:text-xl text-white/80 mb-8 sm:mb-12 max-w-3xl mx-auto px-4"
            >
              Create production-ready voice agents in seconds
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="relative max-w-4xl mx-auto mb-6 sm:mb-8"
            >
              <div className="relative bg-gray-800 rounded-2xl sm:rounded-3xl p-3 sm:p-4 mx-4 sm:mx-0">
                <div className="flex items-center gap-2 sm:gap-4">
                  <div className="flex-1 relative">
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Describe the voice agent you want to create..."
                      className="w-full h-12 sm:h-16 p-3 sm:p-4 bg-transparent text-white placeholder-gray-400 focus:outline-none resize-none text-base sm:text-lg text-left"
                    />
                  </div>
                  
                  <button
                    onClick={handleSubmit}
                    disabled={!prompt.trim()}
                    className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-300 hover:bg-gray-200 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-all duration-200 flex-shrink-0"
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-800 disabled:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                  </button>
                </div>
              </div>
            </motion.div>

              {/* Example prompts */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
                className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-16 sm:mb-32 px-4"
            >
                {examplePrompts.map((example, index) => (
                  <button
                    key={index}
                    onClick={() => setPrompt(example)}
                    className="bg-transparent border border-white/30 rounded-lg px-3 py-2 sm:px-4 sm:py-2 hover:bg-white/10 hover:border-white/50 transition-all duration-200 cursor-pointer text-white/70 hover:text-white text-xs sm:text-sm backdrop-blur-sm"
                  >
                    {example}
                  </button>
                ))}
            </motion.div>

            {/* Community Projects Card */}
            <CommunityProjectsSection delay={0.6} />
          </div>
        </section>

      </div>

      {/* Auth Prompt Modal */}
      {showAuthPrompt && (
        <AuthPromptModal 
          onClose={() => setShowAuthPrompt(false)}
        />
      )}
    </>
  );
}

function AuthPromptModal({ onClose }: { 
  onClose: () => void;
}) {
  const router = useRouter();

  const handleSignUp = () => {
    onClose();
    router.push('/auth?mode=signup');
  };

  const handleSignIn = () => {
    onClose();
    router.push('/auth');
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gray-800 rounded-2xl p-6 sm:p-8 max-w-md w-full mx-4"
        style={{ 
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
        }}
      >
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-3 sm:mb-4">Ready to create your voice agent?</h2>
        <p className="text-gray-300 mb-5 sm:mb-6 text-sm sm:text-base">Sign up or sign in to start building your custom voice agent.</p>
          
        <div className="flex flex-col space-y-3">
          <button
            onClick={handleSignUp}
            className="w-full bg-black text-white px-6 py-3 sm:py-3 rounded-lg hover:bg-gray-900 transition-colors font-medium text-sm sm:text-base"
          >
            Create Account
          </button>
          <button
            onClick={handleSignIn}
            className="w-full bg-white text-gray-900 px-6 py-3 sm:py-3 rounded-lg hover:bg-gray-100 transition-colors font-medium text-sm sm:text-base"
          >
            Sign In
          </button>
          <button
            onClick={onClose}
            className="w-full text-gray-400 hover:text-gray-300 transition-colors py-2 text-sm sm:text-base"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <Suspense fallback={<LoadingBun message="Loading..." />}>
      <LandingPageContent />
    </Suspense>
  );
}
