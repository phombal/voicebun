"use client";

import { CloseIcon } from "@/components/CloseIcon";
import { NoAgentNotification } from "@/components/NoAgentNotification";
import DatabaseTranscriptionView from "@/components/DatabaseTranscriptionView";
import { VoiceAgentConfig as VoiceAgentConfigType } from '@/lib/database/types';
import { Project as DatabaseProject } from '@/lib/database/types';
import { GeneratedCodeDisplay } from "@/components/GeneratedCodeDisplay";
import UserProfile from "@/components/auth/UserProfile";
import PublicLanding from "@/components/LandingPage";
import PublicNavigation from "@/components/PublicNavigation";
import CommunityProjectsSection from "@/components/CommunityProjectsSection";
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
import { useRouter } from "next/navigation";
import { ClientDatabaseService } from "@/lib/database/client-service";
import { LoadingBun, LoadingPageWithTips } from '@/components/LoadingBun';
import { Mic, Sparkles, ArrowRight, Users, Play, Clock, User } from 'lucide-react';
import Link from 'next/link';

// Typewriter effect component
function TypewriterEffect() {
  const [currentRoleIndex, setCurrentRoleIndex] = useState(0);
  const [currentText, setCurrentText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  
  const roles = [
    'Teacher',
    'Sales Rep', 
    'Therapist',
    'Assistant',
    'Tutor',
    'Receptionist',
    'Coach'
  ];
  
  useEffect(() => {
    const currentRole = roles[currentRoleIndex];
    
    const timer = setTimeout(() => {
      if (!isDeleting) {
        // Typing
        if (currentText.length < currentRole.length) {
          setCurrentText(currentRole.slice(0, currentText.length + 1));
        } else {
          // Pause before deleting
          setTimeout(() => setIsDeleting(true), 2000);
        }
      } else {
        // Deleting
        if (currentText.length > 0) {
          setCurrentText(currentText.slice(0, -1));
        } else {
          setIsDeleting(false);
          setCurrentRoleIndex((prev) => (prev + 1) % roles.length);
        }
      }
    }, isDeleting ? 50 : 100);
    
    return () => clearTimeout(timer);
  }, [currentText, isDeleting, currentRoleIndex, roles]);
  
  return (
    <span>
      Your Next {currentText}
      <span className="animate-pulse">|</span>
    </span>
  );
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

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { getUserProjects } = useDatabase();
  const [prompt, setPrompt] = useState("");
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string>("");
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [userProjectsLoading, setUserProjectsLoading] = useState(true);

  // Load user projects for authenticated users
  useEffect(() => {
    if (!user) {
      setUserProjectsLoading(false);
      return;
    }
    
    const loadUserProjects = async () => {
      try {
        setUserProjectsLoading(true);
        const projects = await getUserProjects();
        // Map database projects to local Project interface
        const mappedProjects = projects.map(project => ({
          ...project,
          description: project.description || undefined
        }));
        setUserProjects(mappedProjects.slice(0, 8)); // Show first 8 projects
      } catch (err) {
        console.error('Failed to load user projects:', err);
        setUserProjects([]);
      } finally {
        setUserProjectsLoading(false);
      }
    };

    loadUserProjects();
  }, [user, getUserProjects]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const UserProjectCard = ({ project }: { project: Project }) => {
    const viewCount = Math.floor(Math.random() * 1000) + 50; // Random view count between 50-1049
    
    return (
      <div className="bg-gray-100 rounded-xl overflow-hidden hover:scale-105 transition-all duration-300 group cursor-pointer text-left">
        {/* Preview Image Area */}
        <div className="aspect-video bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 relative overflow-hidden">
          <div className="absolute inset-0 bg-black/20"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-4xl opacity-80">🤖</div>
          </div>
          {/* Play Button Overlay */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="bg-white/20 backdrop-blur-sm rounded-full p-3">
              <Play className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        
        {/* Content Area */}
        <div className="p-3">
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {(user?.user_metadata?.name || user?.email || 'Y')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-2">
                {project.name}
              </h3>
              <div className="flex items-center space-x-1 mb-1">
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span className="text-gray-400 text-xs">{viewCount.toLocaleString() + ' views'}</span>
              </div>
              <div className="text-xs text-gray-500">{formatDate(project.created_at)}</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleSubmit = () => {
    if (!prompt.trim()) return;
    
    if (!user) {
      // Store the prompt and show auth prompt
      setPendingPrompt(prompt.trim());
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

  if (loading) {
    return <LoadingBun />;
  }

  // Show landing page for unauthenticated users
  return (
    <>
      <div className="min-h-screen bg-black" style={{ 
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      }}>
      {/* Header */}
      <PublicNavigation />

        {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
              className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6"
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
            {/* Animated gradient border */}
            <div className="relative">
              <div 
                className="absolute -inset-1 rounded-3xl"
                style={{
                  background: 'conic-gradient(from 0deg, #3b82f6, #8b5cf6, #ec4899, #f59e0b, #3b82f6)',
                  animation: 'gradient-spin 3s linear infinite'
                }}
              />
              <style jsx>{`
                @keyframes gradient-spin {
                  0% { background: conic-gradient(from 0deg, #3b82f6, #8b5cf6, #ec4899, #f59e0b, #3b82f6); }
                  25% { background: conic-gradient(from 90deg, #3b82f6, #8b5cf6, #ec4899, #f59e0b, #3b82f6); }
                  50% { background: conic-gradient(from 180deg, #3b82f6, #8b5cf6, #ec4899, #f59e0b, #3b82f6); }
                  75% { background: conic-gradient(from 270deg, #3b82f6, #8b5cf6, #ec4899, #f59e0b, #3b82f6); }
                  100% { background: conic-gradient(from 360deg, #3b82f6, #8b5cf6, #ec4899, #f59e0b, #3b82f6); }
                }
              `}</style>
              <div className="relative bg-white rounded-3xl p-4 shadow-2xl shadow-white/10">
                <div className="flex items-center gap-4">
                  <div className="flex-1 relative">
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Describe the voice agent you want to create..."
                      className="w-full h-16 p-4 bg-transparent text-black placeholder-gray-500 focus:outline-none resize-none text-lg text-left"
                    />
                  </div>
                  
                  <button
                    onClick={handleSubmit}
                    disabled={!prompt.trim()}
                    className="w-10 h-10 bg-black hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-all duration-200"
                  >
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                  </button>
                </div>
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
                  className="bg-white rounded-lg px-4 py-2 hover:bg-gray-100 transition-colors cursor-pointer text-black hover:text-gray-800 text-sm"
                >
                  {example}
                </button>
              ))}
          </motion.div>

          {/* Credits Box */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
          >
            <div className="bg-white/10 backdrop-blur-sm rounded-lg px-6 py-4 max-w-md mx-auto mb-16">
              <p className="text-white/80 text-sm text-center mb-3">
                Created by a team of researchers<br />
                and builders from
              </p>
              <div className="flex items-center justify-center space-x-6">
                <img 
                  src="/stanford-logo.png" 
                  alt="Stanford" 
                  className="h-8 w-auto opacity-80"
                />
                <img 
                  src="/yc-logo.png" 
                  alt="Y Combinator" 
                  className="h-8 w-auto opacity-80"
                />
              </div>
            </div>
          </motion.div>

          {/* Your Projects Section - Only for authenticated users */}
          {user && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
              className="bg-white rounded-3xl p-8 shadow-2xl shadow-white/10 w-full max-w-none mx-auto mb-8"
            >
              <div className="mb-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
                    Your Projects
                  </h2>
                  <div className="flex items-center space-x-4">
                    <select className="bg-gray-100 text-gray-900 px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-blue-500 text-sm">
                      <option>Recent</option>
                      <option>Alphabetical</option>
                      <option>Most Used</option>
                    </select>
                    <Link
                      href="/dashboard"
                      className="text-blue-600 hover:text-blue-700 transition-colors font-medium text-sm"
                    >
                      View All
                    </Link>
                  </div>
                </div>
                
                {/* Category Filter for User Projects */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {['All', 'Recent', 'Favorites', 'Public', 'Private', 'Draft', 'Active', 'Archived'].map((category) => (
                    <button
                      key={category}
                      className="px-3 py-1 rounded-lg text-sm font-medium transition-colors border border-gray-300 text-gray-600 hover:text-gray-900 hover:border-gray-400"
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
              
              {userProjectsLoading ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[...Array(8)].map((_, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.65 + i * 0.1 }}
                      className="bg-gray-100 rounded-xl overflow-hidden animate-pulse"
                    >
                      <div className="aspect-video bg-gray-200"></div>
                      <div className="p-4">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gray-200 rounded-full"></div>
                          <div>
                            <div className="h-4 w-24 bg-gray-200 rounded mb-1"></div>
                            <div className="h-3 w-16 bg-gray-200 rounded"></div>
                          </div>
                        </div>
                        <div className="space-y-1 mb-3">
                          <div className="h-3 bg-gray-200 rounded w-full"></div>
                          <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : userProjects.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.65 }}
                  className="text-center py-12"
                >
                  <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No projects yet
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Create your first voice agent using the form above!
                  </p>
                </motion.div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {userProjects.slice(0, 8).map((project, index) => (
                    <motion.div
                      key={project.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.65 + index * 0.1 }}
                    >
                      <Link href={`/projects/${project.id}`}>
                        <UserProjectCard project={project} />
                      </Link>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Community Projects Card */}
          <CommunityProjectsSection delay={user ? 0.75 : 0.6} />
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

function AuthPromptModal({ onClose, onAuthComplete }: { 
  onClose: () => void; 
  onAuthComplete: () => void; 
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl p-8 max-w-md mx-4"
        style={{ 
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
        }}
      >
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Ready to create your voice agent?</h2>
        <p className="text-gray-600 mb-6">Sign up or sign in to start building your custom voice agent.</p>
          
        <div className="flex flex-col space-y-3">
          <button
            onClick={handleSignUp}
            className="w-full bg-black text-white px-6 py-3 rounded-lg hover:bg-gray-800 transition-colors font-medium"
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
