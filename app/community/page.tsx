'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import PublicNavigation from '@/components/PublicNavigation';
import UserProfile from '@/components/auth/UserProfile';
import CommunityProjectsSection from '@/components/CommunityProjectsSection';
import { 
  Users, 
  Mic, 
  Play, 
  Clock, 
  User, 
  Heart,
  Search,
  Filter,
  ChevronRight,
  Sparkles,
  Globe,
  ArrowRight
} from 'lucide-react';

export default function CommunityPage() {
  const { user } = useAuth();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-black" style={{ 
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' 
    }}>
      {/* Conditional Navigation */}
      {user ? (
        /* Authenticated Navigation */
        <header className="">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center">
              <img 
                src="/VoiceBun-White.png" 
                alt="VoiceBun" 
                className="h-10 w-auto cursor-pointer"
                onClick={() => router.push('/dashboard')}
              />
            </div>
            <div className="flex items-center space-x-4">
              <a
                href="/projects"
                className="text-white/70 hover:text-white transition-colors"
              >
                Projects
              </a>
              <a
                href="/community"
                className="text-white hover:text-white transition-colors"
              >
                Community
              </a>
              <UserProfile />
            </div>
          </div>
        </header>
      ) : (
        /* Public Navigation */
        <PublicNavigation />
      )}

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-12">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-bold text-white mb-4"
          >
            Community Voice Agents
          </motion.h1>
        </div>

        {/* Community Projects */}
        <CommunityProjectsSection 
          variant="full-page"
          theme="dark"
          title=""
          showSearch={true}
          showFilters={true}
          delay={0.3}
          gridCols="auto"
        />
      </section>
    </div>
  );
} 