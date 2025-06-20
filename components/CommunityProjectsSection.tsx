'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Users, Play, ArrowRight, Search, Filter, Clock, User, Mic, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useDatabase } from '@/hooks/useDatabase';
import { useAuth } from '@/contexts/AuthContext';

interface PublicProject {
  id: string;
  name: string;
  description: string | null;
  user_name: string | null;
  user_email: string;
  created_at: string;
  category?: string;
  project_emoji?: string;
  view_count?: number;
  project_data?: {
    public_title?: string;
    public_description?: string;
    public_welcome_message?: string;
    project_emoji?: string;
    project_photo?: string;
    system_prompt: string;
    tts_provider: string;
    tts_voice: string;
    llm_model: string;
    category?: string;
  };
}

interface CommunityProjectsSectionProps {
  delay?: number;
  variant?: 'card' | 'full-page';
  theme?: 'light' | 'dark';
  title?: string;
  showSearch?: boolean;
  showFilters?: boolean;
  limit?: number;
  gridCols?: 'auto' | 2 | 3 | 4;
  projectType?: 'community' | 'user';
}

export default function CommunityProjectsSection({ 
  delay = 0.6,
  variant = 'card',
  theme = 'light',
  title = 'Community Projects',
  showSearch = false,
  showFilters = true,
  limit,
  gridCols = 'auto',
  projectType = 'community'
}: CommunityProjectsSectionProps) {
  const [featuredProjects, setFeaturedProjects] = useState<PublicProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(new Date());
  const { getUserProjects } = useDatabase();
  const { user } = useAuth();

  const fetchFeaturedProjects = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setProjectsLoading(true);
      } else {
        setRefreshing(true);
      }
      
      let projects: any[] = [];
      
      if (projectType === 'user' && user) {
        // Fetch user's own projects using the database hook
        const userProjects = await getUserProjects();
        // Convert user projects to the format expected by the component
        projects = userProjects.map(project => ({
          id: project.id,
          name: project.name,
          description: project.description,
          user_name: user.user_metadata?.name || user.email?.split('@')[0] || 'You',
          user_email: user.email,
          created_at: project.created_at,
          category: project.category,
          project_emoji: project.project_emoji,
          view_count: project.view_count || 0,
          project_data: {
            public_title: project.name,
            public_description: project.description,
            project_emoji: project.project_emoji || '🤖',
            system_prompt: project.initial_prompt || '',
            tts_provider: 'cartesia',
            tts_voice: 'neutral',
            llm_model: 'gpt-4o-mini',
            category: project.category
          }
        }));
      } else {
        // Fetch community projects with cache-busting parameter
        const cacheBuster = Date.now();
        const response = await fetch(`/api/community/projects?t=${cacheBuster}`, {
          cache: 'no-store', // Prevent caching
          headers: {
            'Cache-Control': 'no-cache',
          }
        });
        if (!response.ok) {
          throw new Error('Failed to fetch community projects');
        }
        const data = await response.json();
        projects = data.projects || [];
        console.log(`📊 Fetched ${projects.length} community projects (${silent ? 'silent' : 'visible'} refresh)`);
      }
      
      // Apply limit if specified
      if (limit) {
        projects = projects.slice(0, limit);
      }
      
      setFeaturedProjects(projects);
      setLastRefreshTime(new Date());
    } catch (err) {
      console.error('Failed to load projects:', err);
      if (!silent) {
        setFeaturedProjects([]);
      }
    } finally {
      if (!silent) {
        setProjectsLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, [projectType, user, getUserProjects, limit]);

  // Initial data fetch
  useEffect(() => {
    fetchFeaturedProjects();
  }, [fetchFeaturedProjects]);

  // Auto-refresh every 30 seconds when page is visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) {
        console.log('🔄 Auto-refreshing community projects...');
        fetchFeaturedProjects(true); // Silent refresh
      }
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [fetchFeaturedProjects]);

  // Refresh when user returns to the tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('👁️ Page became visible - refreshing community projects...');
        fetchFeaturedProjects(true); // Silent refresh
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchFeaturedProjects]);

  // Manual refresh function
  const handleManualRefresh = () => {
    console.log('🔄 Manual refresh triggered');
    fetchFeaturedProjects();
  };

  // Function to track project views
  const trackProjectView = async (projectId: string, projectType: 'community' | 'user') => {
    try {
      const endpoint = projectType === 'community' 
        ? `/api/community/projects/${projectId}/view`
        : `/api/projects/${projectId}/view`;
      
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      // Optionally update the local state to reflect the incremented view count
      setFeaturedProjects(prev => 
        prev.map(project => 
          project.id === projectId 
            ? { ...project, view_count: (project.view_count || 0) + 1 }
            : project
        )
      );
    } catch (error) {
      console.error('Failed to track project view:', error);
      // Don't throw error - view tracking is not critical for user experience
    }
  };

  // Filter projects based on search and category
  const filteredProjects = featuredProjects.filter(project => {
    const matchesSearch = !showSearch || searchQuery === '' || 
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.description && project.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (project.project_data?.public_description && project.project_data.public_description.toLowerCase().includes(searchQuery.toLowerCase()));
    
    // Use project-level category for filtering
    const projectCategory = project.category || project.project_data?.category;
    const matchesCategory = selectedCategory === 'All' || projectCategory === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const ProjectCard = ({ project, index }: { project: PublicProject; index: number }) => {
    const emoji = project.project_emoji || project.project_data?.project_emoji || '🤖';
    
    // Debug logging for emoji selection
    if (projectType === 'community') {
      console.log(`🎭 Project "${project.name}" emoji selection:`, {
        projectId: project.id,
        project_emoji: project.project_emoji,
        project_data_emoji: project.project_data?.project_emoji,
        selected_emoji: emoji,
        category: project.category || project.project_data?.category
      });
    }
    
    const viewCount = project.view_count || 0;
    const displayTitle = project.project_data?.public_title || project.name || 'Untitled Project';
    const displayDescription = project.project_data?.public_description || project.description || 'No description available';
    const category = project.category || project.project_data?.category;
    
    // Determine the correct link based on project type
    const projectLink = projectType === 'user' ? `/projects/${project.id}` : `/community/${project.id}`;
    
    // Handle project click with view tracking
    const handleProjectClick = (e: React.MouseEvent) => {
      // Track the view
      trackProjectView(project.id, projectType);
      // Navigation will happen automatically via the Link component
    };

    // Get category display info and gradient
    const getCategoryInfo = (cat: string | undefined) => {
      const categoryMap = {
        'Healthcare': { 
          color: 'bg-red-100 text-red-800', 
          emoji: '🏥',
          gradient: 'from-red-500 via-pink-500 to-rose-500'
        },
        'Education': { 
          color: 'bg-blue-100 text-blue-800', 
          emoji: '📚',
          gradient: 'from-blue-500 via-indigo-500 to-purple-500'
        },
        'Customer Service': { 
          color: 'bg-green-100 text-green-800', 
          emoji: '💬',
          gradient: 'from-green-500 via-emerald-500 to-teal-500'
        },
        'Personal Assistant': { 
          color: 'bg-purple-100 text-purple-800', 
          emoji: '🤖',
          gradient: 'from-purple-500 via-violet-500 to-indigo-500'
        },
        'Sales & Marketing': { 
          color: 'bg-orange-100 text-orange-800', 
          emoji: '📈',
          gradient: 'from-orange-500 via-amber-500 to-yellow-500'
        },
        'Entertainment': { 
          color: 'bg-pink-100 text-pink-800', 
          emoji: '🎉',
          gradient: 'from-pink-500 via-rose-500 to-red-500'
        },
        'Productivity': { 
          color: 'bg-gray-100 text-gray-800', 
          emoji: '⚡',
          gradient: 'from-gray-500 via-slate-500 to-zinc-500'
        }
      };
      return cat && categoryMap[cat as keyof typeof categoryMap] 
        ? categoryMap[cat as keyof typeof categoryMap]
        : { 
            color: 'bg-gray-100 text-gray-800', 
            emoji: '🤖',
            gradient: 'from-blue-500 via-purple-500 to-pink-500'
          };
    };
    
    const categoryInfo = getCategoryInfo(category);
    
    // Always use light theme cards inside the white container
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: delay + 0.1 + index * 0.1 }}
      >
        <Link href={projectLink} onClick={handleProjectClick}>
          <div className="bg-gray-100 rounded-xl overflow-hidden hover:scale-105 transition-all duration-300 group cursor-pointer text-left">
            {/* Preview Image Area */}
            <div className={`aspect-video bg-gradient-to-br ${categoryInfo.gradient} relative overflow-hidden`}>
              <div className="absolute inset-0 bg-black/20"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-4xl opacity-80">{emoji}</div>
              </div>
              {/* Play Button Overlay */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-white/20 backdrop-blur-sm rounded-full p-3">
                  <Play className="w-6 h-6 text-white" />
                </div>
              </div>
              {/* Category Badge */}
              {categoryInfo && (
                <div className="absolute top-2 right-2">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${categoryInfo.color}`}>
                    {category}
                  </span>
                </div>
              )}
            </div>
            
            {/* Content Area */}
            <div className="p-3">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {(project.user_name || 'A')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-2">
                    {displayTitle}
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
        </Link>
      </motion.div>
    );
  };

  // Get grid classes based on variant and gridCols
  const getGridClasses = () => {
    if (gridCols === 'auto') {
      return variant === 'full-page' ? 'grid md:grid-cols-2 lg:grid-cols-4 gap-4' : 'grid md:grid-cols-2 lg:grid-cols-4 gap-4';
    }
    return `grid gap-4 ${gridCols === 2 ? 'md:grid-cols-2' : gridCols === 3 ? 'md:grid-cols-2 lg:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-4'}`;
  };

  // Always use white card container
  const containerClasses = "bg-white rounded-3xl p-8 shadow-2xl shadow-white/10 w-full max-w-none mx-auto";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={containerClasses}
    >
      {/* Title inside the white card */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
              {title}
            </h2>
            {projectType === 'community' && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleManualRefresh}
                  className="flex items-center space-x-1 px-3 py-1 text-sm text-gray-600 hover:text-blue-600 transition-colors"
                  title="Refresh projects"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Refresh</span>
                </button>
                <span className="text-xs text-gray-400">
                  Updated {lastRefreshTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}
          </div>
          {variant === 'card' && (
            <div className="flex items-center space-x-4">
              <Link
                href={projectType === 'user' ? '/projects' : '/community'}
                className="text-blue-600 hover:text-blue-700 transition-colors font-medium text-sm"
              >
                View All
              </Link>
            </div>
          )}
        </div>
        
        {/* Search and Filters */}
        {(showSearch || showFilters) && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: delay + 0.1 }}
            className="mb-8"
          >
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              {showSearch && (
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search projects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-lg bg-gray-100 border border-gray-300 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              )}
              
              {showFilters && (
                <div className="flex items-center space-x-2 overflow-x-auto">
                  {['All', 'Healthcare', 'Education', 'Customer Service', 'Personal Assistant', 'Sales & Marketing', 'Entertainment', 'Productivity'].map((category) => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={`flex items-center px-4 py-2 rounded-lg transition-colors whitespace-nowrap text-sm ${
                        selectedCategory === category
                          ? 'bg-blue-600 text-white'
                          : 'border border-gray-300 text-gray-600 hover:text-gray-900 hover:border-gray-400'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>
      
      {projectsLoading ? (
        <div className={getGridClasses()}>
          {[...Array(variant === 'full-page' ? 8 : (limit || 8))].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: delay + 0.1 + i * 0.1 }}
              className="bg-gray-100 rounded-xl overflow-hidden animate-pulse"
            >
              <div className="aspect-video bg-gray-200"></div>
              <div className="p-4">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-6 h-6 bg-gray-200 rounded"></div>
                    <div>
                      <div className="h-4 w-24 bg-gray-200 rounded mb-2"></div>
                      <div className="h-3 w-16 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                </div>
                <div className="space-y-2 mb-3">
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: delay + 0.1 }}
          className="text-center py-12"
        >
          <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-medium mb-2 text-gray-900">
            {searchQuery ? 'No projects found' : 'No community projects available'}
          </h3>
          <p className="mb-6 text-gray-600">
            {searchQuery 
              ? 'Try adjusting your search terms'
              : 'Be the first to share your voice agent with the community!'
            }
          </p>
          <Link
            href="/auth?mode=signup"
            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg transition-all duration-200 inline-flex items-center space-x-2"
          >
            <span>Get Started</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      ) : (
        <div className={getGridClasses()}>
          {filteredProjects.map((project, index) => (
            <ProjectCard key={project.id} project={project} index={index} />
          ))}
        </div>
      )}
    </motion.div>
  );
} 