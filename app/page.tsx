"use client";

import { CloseIcon } from "@/components/CloseIcon";
import { NoAgentNotification } from "@/components/NoAgentNotification";
import DatabaseTranscriptionView from "@/components/DatabaseTranscriptionView";
import { VoiceAgentConfig as VoiceAgentConfigType } from '@/lib/database/types';
import { Project as DatabaseProject } from '@/lib/database/types';
import { GeneratedCodeDisplay } from "@/components/GeneratedCodeDisplay";
import UserProfile from "@/components/auth/UserProfile";
import PublicLanding from "@/components/LandingPage";
import { useAuth } from "@/contexts/AuthContext";
import {
  BarVisualizer,
  DisconnectButton,
  RoomAudioRenderer,
  RoomContext,
  VideoTrack,
  VoiceAssistantControlBar,
  useVoiceAssistant,
} from "@livekit/components-react";
import { AnimatePresence, motion } from "framer-motion";
import { Room, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useState } from "react";
import type { ConnectionDetails } from "./api/connection-details/route";
import { useDatabase } from "@/hooks/useDatabase";
import { DatabaseService } from "@/lib/database/service";
import { useRouter } from "next/navigation";

// Typewriter effect component
function TypewriterEffect() {
  const [text, setText] = useState('');
  const fullText = 'Build Voice Agents in Minutes';
  
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      if (i < fullText.length) {
        setText(fullText.slice(0, i + 1));
        i++;
        } else {
        clearInterval(timer);
      }
    }, 100);
    
    return () => clearInterval(timer);
  }, []);
  
  return <span>{text}<span className="animate-pulse">|</span></span>;
}

type AppState = "landing" | "loading" | "code-display" | "conversation";

interface Project {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  last_accessed_at?: string;
  initial_prompt?: string;
  config?: {
    personality?: string;
    language?: string;
    responseStyle?: string;
    capabilities?: string[];
  };
}

// Loading page component with animated logo and tips
function LoadingPage() {
  const [currentTip, setCurrentTip] = useState(0);
  
  const tips = [
    "💡 Tip: Be specific in your voice agent description for better results",
    "🎯 Tip: You can customize personality, language, and response style",
    "🔊 Tip: Test your agent with different conversation scenarios",
    "⚡ Tip: Use example prompts to get started quickly",
    "🤖 Tip: Your agent will remember context throughout conversations",
    "📝 Tip: Generated code includes all necessary dependencies",
    "🎨 Tip: Agents can handle multiple languages and accents",
    "🔧 Tip: You can modify the generated code after creation"
  ];

  // Rotate tips every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTip((prev) => (prev + 1) % tips.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [tips.length]);

    return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col items-center justify-center bg-gray-800"
      style={{ 
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      }}
    >
        <div className="text-center">
        {/* Animated VoiceBun Logo */}
        <motion.div
          animate={{ 
            x: [-20, 20, -20],
          }}
          transition={{ 
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="mb-8"
        >
          <img 
            src="/VoiceBun-BunOnly.png" 
            alt="VoiceBun" 
            className="h-24 w-auto mx-auto"
          />
        </motion.div>

        {/* Loading Dots */}
        <div className="flex justify-center space-x-2 mb-8">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 1, 0.5]
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.2
              }}
              className="w-3 h-3 bg-white rounded-full"
            />
          ))}
        </div>

        {/* Rotating Tips */}
        <motion.div
          key={currentTip}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.5 }}
          className="max-w-md mx-auto"
        >
          <p className="text-white/90 text-lg leading-relaxed">
            {tips[currentTip]}
          </p>
        </motion.div>
      </div>
    </motion.div>
    );
  }

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string>("");

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const handleSubmit = () => {
    if (!prompt.trim()) return;
    
    if (!user) {
      // Store the prompt and show auth prompt
      setPendingPrompt(prompt.trim());
      setShowAuthPrompt(true);
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

  if (loading) {
  return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Show landing page for unauthenticated users
  return (
    <>
      <div className="min-h-screen" style={{ 
        background: 'linear-gradient(to bottom, rgb(24, 0, 121) 0%, rgb(255, 106, 0) 40%, rgb(255, 255, 255) 70%)', 
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      }}>
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center">
              <img 
                src="/VoiceBun-White.png" 
                alt="VoiceBun" 
                className="h-10 w-auto"
              />
          </div>
          <div className="flex items-center space-x-4">
            <a
              href="/auth"
              className="text-white/70 hover:text-white transition-colors"
            >
              Sign In
            </a>
            <a
                href="/auth"
                className="bg-white text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors font-medium"
            >
              Get Started
            </a>
          </div>
        </div>
      </header>

        {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
              className="text-4xl md:text-5xl font-bold text-white mb-6"
              style={{ fontFamily: 'Sniglet, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}
          >
            <TypewriterEffect />
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-white/80 mb-12 max-w-3xl mx-auto"
          >
            Create and share voice agents by chatting with AI
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="relative max-w-4xl mx-auto mb-8"
          >
              <div className="bg-gray-900/95 backdrop-blur-md rounded-3xl p-4 shadow-2xl shadow-black/40">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Describe the voice agent you want to create..."
                    className="w-full h-16 p-4 bg-transparent text-white placeholder-white/60 focus:outline-none resize-none text-lg text-left"
                  />
                </div>
                
                <button
                  onClick={handleSubmit}
                  disabled={!prompt.trim()}
                  className="w-10 h-10 bg-white hover:bg-gray-100 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-all duration-200"
                >
                  <svg className="w-5 h-5 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              className="flex flex-wrap justify-center gap-3 mb-16"
          >
              {examplePrompts.map((example, index) => (
                <button
                  key={index}
                  onClick={() => setPrompt(example)}
                  className="bg-white/10 backdrop-blur-sm text-white/90 px-4 py-2 rounded-full hover:bg-white/20 transition-all duration-200 text-sm"
                >
                  {example}
                </button>
              ))}
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
        <section className="max-w-7xl mx-auto px-6 py-20">
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon="🎤"
              title="Natural Conversations"
              description="Advanced speech recognition and synthesis for human-like interactions"
            />
            <FeatureCard
              icon="🧠"
              title="Smart Responses"
              description="Powered by state-of-the-art language models for intelligent replies"
            />
            <FeatureCard
              icon="⚡"
              title="Deploy Instantly"
              description="Get your voice agent running in minutes, not hours"
            />
        </div>
      </section>
    </div>

      {/* Auth Prompt Modal */}
      {showAuthPrompt && (
        <AuthPromptModal 
          onClose={() => setShowAuthPrompt(false)}
          onAuthComplete={() => {
            setShowAuthPrompt(false);
            // After auth, redirect to dashboard with the prompt
            router.push(`/dashboard?prompt=${encodeURIComponent(pendingPrompt)}`);
          }}
        />
      )}
    </>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center"
    >
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-white/70">{description}</p>
    </motion.div>
  );
}

function AuthPromptModal({ onClose, onAuthComplete }: { 
  onClose: () => void; 
  onAuthComplete: () => void; 
}) {
  const router = useRouter();

  const handleSignUp = () => {
    router.push('/auth');
    onAuthComplete();
  };

  const handleSignIn = () => {
    router.push('/auth');
    onAuthComplete();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
    <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl p-8 max-w-md mx-4"
      >
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Ready to create your voice agent?</h2>
        <p className="text-gray-600 mb-6">Sign up or sign in to start building your custom voice agent.</p>
          
        <div className="flex flex-col space-y-3">
            <button
              onClick={handleSignUp}
            className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
            Create Account
            </button>
            <button
              onClick={handleSignIn}
            className="w-full bg-gray-100 text-gray-900 px-6 py-3 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              Sign In
            </button>
            <button
              onClick={onClose}
            className="w-full text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
        </div>
      </motion.div>
        </div>
  );
}
