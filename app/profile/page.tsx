'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useDatabase } from '@/hooks/useDatabase';
import UserProfile from '@/components/auth/UserProfile';
import UserPlanCard from '@/components/UserPlanCard';
import { User, Phone, CreditCard, Settings, Plus, Trash2, Edit3 } from 'lucide-react';
import { Project, PhoneNumber } from '@/lib/database/types';

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { getUserProjects, getUserPhoneNumbers } = useDatabase();
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [activeTab, setActiveTab] = useState<'account' | 'phone' | 'billing'>('account');

  // Redirect unauthenticated users
  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  // Load user data
  useEffect(() => {
    if (!user) return;
    
    const loadData = async () => {
      try {
        const userProjects = await getUserProjects();
        setProjects(userProjects);
        
        // Load real phone numbers from Supabase
        const userPhoneNumbers = await getUserPhoneNumbers();
        setPhoneNumbers(userPhoneNumbers);
      } catch (error) {
        console.error('Failed to load profile data:', error);
      } finally {
        setLoadingData(false);
      }
    };

    loadData();
  }, [getUserProjects, getUserPhoneNumbers, user]);

  if (loading || (user && loadingData)) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center" style={{ 
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white/70">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  const currentPlan = 'Free'; // This would come from your billing system

  return (
    <div className="min-h-screen bg-black" style={{ 
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    }}>
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md shadow-lg">
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
            <UserProfile />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8 pt-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-white mb-2">Profile Settings</h1>
          <p className="text-white/70">Manage your account, phone numbers, and billing settings</p>
        </motion.div>

        {/* Tab Navigation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex space-x-1 bg-white/10 rounded-lg p-1 mb-8"
        >
          <button
            onClick={() => setActiveTab('account')}
            className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'account'
                ? 'bg-white text-black'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            }`}
          >
            <User className="w-4 h-4 mr-2" />
            Account
          </button>
          <button
            onClick={() => setActiveTab('phone')}
            className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'phone'
                ? 'bg-white text-black'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            }`}
          >
            <Phone className="w-4 h-4 mr-2" />
            Phone Numbers
          </button>
          <button
            onClick={() => setActiveTab('billing')}
            className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'billing'
                ? 'bg-white text-black'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            }`}
          >
            <CreditCard className="w-4 h-4 mr-2" />
            Billing & Plan
          </button>
        </motion.div>

        {/* Tab Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          {activeTab === 'account' && (
            <div className="space-y-6">
              {/* Account Information */}
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
                  <User className="w-5 h-5 mr-2" />
                  Account Information
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">Full Name</label>
                    <input
                      type="text"
                      value={displayName}
                      className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30"
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">Email Address</label>
                    <input
                      type="email"
                      value={user.email || ''}
                      className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30"
                      readOnly
                    />
                  </div>
                </div>
                <div className="mt-6">
                  <label className="block text-sm font-medium text-white/70 mb-2">Account Created</label>
                  <p className="text-white">
                    {new Date(user.created_at || '').toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              </div>

              {/* Usage Statistics */}
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
                  <Settings className="w-5 h-5 mr-2" />
                  Usage Statistics
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white mb-1">{projects.length}</div>
                    <div className="text-white/70 text-sm">Voice Agents</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white mb-1">{phoneNumbers.filter(p => p.is_active).length}</div>
                    <div className="text-white/70 text-sm">Active Phone Numbers</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white mb-1">0 min</div>
                    <div className="text-white/70 text-sm">This Month's Usage</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'phone' && (
            <div className="space-y-6">
              {/* Phone Numbers Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Phone Numbers</h2>
                  <p className="text-white/70 text-sm">Manage phone numbers for your voice agents</p>
                </div>
              </div>

              {/* Phone Numbers List */}
              <div className="space-y-4">
                {phoneNumbers.map((phone) => (
                  <div key={phone.id} className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className={`w-3 h-3 rounded-full ${phone.is_active ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                        <div>
                          <div className="text-white font-medium">{phone.phone_number}</div>
                          <div className="text-white/70 text-sm">
                            {phone.status} • {phone.project_id ? '1 project' : '0 projects'} • Added {new Date(phone.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          phone.is_active 
                            ? 'bg-green-500/20 text-green-400' 
                            : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {phone.is_active ? 'active' : 'inactive'}
                        </span>
                        <button className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {phoneNumbers.length === 0 && (
                <div className="text-center py-12">
                  <Phone className="w-12 h-12 text-white/30 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No phone numbers yet</h3>
                  <p className="text-white/70 mb-6">Phone numbers will appear here once you add them to your projects</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="space-y-6">
              {/* User Plan Card */}
              <UserPlanCard />
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
} 