'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Project as DatabaseProject } from '@/lib/database/types';
import { useDatabase } from '@/hooks/useDatabase';
import UserProfile from '@/components/auth/UserProfile';

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

export default function ProjectsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { getUserProjects } = useDatabase();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  // Redirect unauthenticated users to landing
  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  // Load user projects
  useEffect(() => {
    if (!user) return;
    
    const loadProjects = async () => {
      try {
        const userProjects = await getUserProjects();
        const projectsData = userProjects.map((project: DatabaseProject) => ({
          ...project,
          description: project.description || undefined
        }));
        setProjects(projectsData);
      } catch (error) {
        console.error('Failed to load projects:', error);
      } finally {
        setLoadingProjects(false);
      }
    };

    loadProjects();
  }, [getUserProjects, user]);

  if (loading || (user && loadingProjects)) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading projects...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <img 
              src="/VoiceBun-White.png" 
              alt="VoiceBun" 
              className="h-10 w-auto cursor-pointer"
              onClick={() => router.push('/dashboard')}
            />
            <h1 className="text-xl font-bold text-white">Projects</h1>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors font-medium"
            >
              New Project
            </button>
            <UserProfile />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {projects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <div className="text-6xl mb-4">🤖</div>
            <h2 className="text-2xl font-bold text-white mb-4">No projects yet</h2>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              Create your first voice agent to get started. It only takes a few minutes!
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors font-medium"
            >
              Create Your First Agent
            </button>
          </motion.div>
        ) : (
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between mb-8"
            >
              <div>
                <h2 className="text-2xl font-bold text-white">Your Voice Agents</h2>
                <p className="text-gray-400">
                  {projects.length} {projects.length === 1 ? 'project' : 'projects'}
                </p>
              </div>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {projects.map((project, index) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden hover:border-gray-600 transition-all duration-200 cursor-pointer group"
                  onClick={() => router.push(`/projects/${project.id}`)}
                >
                  <div className="aspect-video bg-gradient-to-br from-blue-500 to-purple-600 relative">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-4xl">🤖</div>
                    </div>
                    <div className="absolute top-2 right-2">
                      <div className="bg-black/20 backdrop-blur-sm rounded-full px-2 py-1">
                        <span className="text-white text-xs">Active</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="text-white font-medium text-sm group-hover:text-blue-400 transition-colors mb-2 line-clamp-1">
                      {project.name}
                    </h3>
                    <p className="text-gray-400 text-xs mb-3 line-clamp-2">
                      {project.description}
                    </p>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>
                        Created {new Date(project.created_at).toLocaleDateString()}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/projects/${project.id}/conversation`);
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs transition-colors"
                      >
                        Test
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
} 