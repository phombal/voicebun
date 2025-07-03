'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Project as DatabaseProject } from '@/lib/database/types';
import { VoiceAgentConfig as VoiceAgentConfigType } from '@/lib/database/types';
import { useDatabase } from '@/hooks/useDatabase';
import UserProfile from '@/components/auth/UserProfile';
import DeleteProjectModal from '@/components/DeleteProjectModal';
import { LoadingBun } from '@/components/LoadingBun';
import CommunityProjectsSection from '@/components/CommunityProjectsSection';
import Image from 'next/image';

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
  const { 
    getUserProjects, 
    createProject, 
    createProjectData, 
    updateProject,
    deleteProject: deleteProjectFromDB 
  } = useDatabase();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [creatingProject, setCreatingProject] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    project: Project | null;
    isDeleting: boolean;
  }>({
    isOpen: false,
    project: null,
    isDeleting: false
  });

  // Utility function to invalidate user projects cache
  const invalidateProjectsCache = useCallback(async (action: string) => {
    if (!user) return;
    
    try {
      await fetch('/api/user/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          action
        }),
      });
      console.log(`✅ Invalidated user projects cache due to: ${action}`);
    } catch (error) {
      console.warn(`⚠️ Failed to invalidate cache for action: ${action}`, error);
    }
  }, [user]);

  // Function to refresh projects (useful for debugging or manual refresh)
  const refreshProjects = useCallback(async () => {
    if (!user) return;
    
    console.log('🔄 Manually refreshing projects...');
    setLoadingProjects(true);
    
    // Invalidate cache first
    await invalidateProjectsCache('manual_refresh');
    
    // The useEffect will automatically reload when loadingProjects becomes true
  }, [user, invalidateProjectsCache]);

  // Safety net: automatically reset loadingProjects if it gets stuck
  useEffect(() => {
    if (loadingProjects && user && !loading) {
      console.log('🛡️ Safety net: loadingProjects has been true with authenticated user, setting timeout');
      const safetyTimeout = setTimeout(() => {
        console.log('⚠️ Safety timeout: forcing loadingProjects to false to prevent infinite loading');
        setLoadingProjects(false);
      }, 15000); // 15 second safety net
      
      return () => clearTimeout(safetyTimeout);
    }
  }, [user, loading]); // Removed loadingProjects to prevent infinite loops

  // Load user projects
  useEffect(() => {
    console.log('📂 Projects useEffect triggered:', {
      user: !!user,
      userId: user?.id,
      loadingProjects,
      loading
    });

    // Reset loading state when user changes
    if (!user) {
      console.log('📂 No user, resetting loading state');
      setLoadingProjects(false);
      setProjects([]);
      return;
    }
    
    // Don't load if auth is still loading or if we're already loading projects
    if (loading || !loadingProjects) {
      return;
    }
    
    // Set timeout fallback to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.log('⏰ Projects loading timeout reached, forcing completion');
      setLoadingProjects(false);
    }, 10000); // 10 second timeout
    
    const loadProjects = async () => {
      console.log('📂 Starting to load projects for user:', user.id);
      try {
        // Use the new cached API endpoint
        const response = await fetch(`/api/user/projects?userId=${encodeURIComponent(user.id)}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch projects');
        }
        
        console.log('📂 Raw projects from API:', data.projects.length, 'projects');
        
        const projectsData = data.projects.map((project: DatabaseProject) => ({
          ...project,
          description: project.description || undefined
        }));
        
        console.log('📂 Processed projects data:', projectsData.length, 'projects');
        setProjects(projectsData);
        console.log('✅ Projects set successfully');
      } catch (error) {
        console.error('❌ Failed to load projects:', error);
        console.error('❌ Error details:', {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : 'No stack',
          userId: user?.id
        });
        // Set empty projects on error to prevent infinite loading
        setProjects([]);
      } finally {
        console.log('📂 Setting loadingProjects to false');
        clearTimeout(timeoutId); // Clear timeout since we completed
        setLoadingProjects(false);
      }
    };

    // Only load if we haven't loaded yet
    if (loadingProjects) {
      loadProjects();
    }
    
    // Cleanup function
    return () => {
      clearTimeout(timeoutId);
    };
  }, [user?.id]); // Removed getUserProjects dependency since we're using fetch now

  // Reset loading state when user changes (separate effect to avoid conflicts)
  useEffect(() => {
    if (user) {
      setLoadingProjects(true);
    }
  }, [user?.id]);

  const confirmDeleteProject = async () => {
    if (!deleteModal.project) return;

    setDeleteModal(prev => ({ ...prev, isDeleting: true }));

    try {
      await deleteProjectFromDB(deleteModal.project.id);
      
      // Remove the project from the local state
      setProjects(prev => prev.filter(p => p.id !== deleteModal.project!.id));
      
      // Invalidate the user's projects cache
      await invalidateProjectsCache('project_deleted');
      
      // Close the modal
      setDeleteModal({
        isOpen: false,
        project: null,
        isDeleting: false
      });
    } catch (error) {
      console.error('Failed to delete project:', error);
      setDeleteModal(prev => ({ ...prev, isDeleting: false }));
      // You could add a toast notification here for error handling
    }
  };

  const closeDeleteModal = () => {
    if (!deleteModal.isDeleting) {
      setDeleteModal({
        isOpen: false,
        project: null,
        isDeleting: false
      });
    }
  };

  const handleCreateNewProject = async () => {
    if (!user || false) return;
    
    setCreatingProject(true);
    
    try {
      // Create a basic project with minimal configuration
      const timestamp = new Date().toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
      const projectName = `New Voice Agent (${timestamp})`;
      const projectDescription = `Voice agent created on ${timestamp}`;
      
      // Basic configuration
      const config: VoiceAgentConfigType = {
        prompt: "You are a helpful AI voice assistant.",
        personality: "friendly",
        capabilities: [],
        language: "english",
        responseStyle: "conversational"
      };

      // Create project in database
      const project = await createProject(
        projectName,
        projectDescription,
        config.prompt,
        config,
        "" // Empty code initially
      );
      
      console.log('✅ Created new project:', project.id);
      
      // Auto-tag the project based on its content
      console.log('🏷️ Starting auto-tagging process for new project...');
      let autoTaggedCategory = 'other'; // Default category
      let categoryEmoji = '🤖'; // Default emoji
      
      console.log('🏷️ Initial values - Category:', autoTaggedCategory, 'Emoji:', categoryEmoji);
      
      try {
        console.log('🏷️ Making auto-tag API request with data:', {
          systemPrompt: "You are a helpful AI voice assistant...",
          title: projectName,
          description: projectDescription || 'undefined'
        });
        
        const autoTagResponse = await fetch('/api/auto-tag', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            systemPrompt: "You are a helpful AI voice assistant. Provide clear, accurate, and helpful responses to user questions while maintaining a professional yet friendly conversational tone.",
            title: projectName,
            description: projectDescription || undefined
          }),
        });

        console.log('🏷️ Auto-tag API response status:', autoTagResponse.status);
        console.log('🏷️ Auto-tag API response ok:', autoTagResponse.ok);

        if (autoTagResponse.ok) {
          const responseData = await autoTagResponse.json();
          console.log('🏷️ Auto-tag API response data:', responseData);
          
          const { category } = responseData;
          console.log('🏷️ Extracted category from response:', category, 'Type:', typeof category);
          
          if (category && category !== 'undefined') {
            autoTaggedCategory = category;
            console.log('✅ Category updated to:', autoTaggedCategory);
          } else {
            console.warn('⚠️ Category from API is empty or undefined, keeping default:', autoTaggedCategory);
          }
          
          // Get the emoji for the auto-tagged category
          const { getCategoryEmoji } = await import('@/lib/auto-tagger');
          categoryEmoji = getCategoryEmoji(autoTaggedCategory as any) || '🤖';
          console.log('🎯 Setting project emoji based on category:', `${autoTaggedCategory} -> ${categoryEmoji}`);
        } else {
          const errorText = await autoTagResponse.text();
          console.warn('⚠️ Auto-tagging failed with status:', autoTagResponse.status);
          console.warn('⚠️ Error response:', errorText);
          console.warn('⚠️ Using default category and emoji');
        }
      } catch (error) {
        console.error('❌ Auto-tagging error:', error);
        console.log('🔄 Continuing with default category:', autoTaggedCategory, 'and emoji:', categoryEmoji);
        // Continue with default category and emoji
      }
      
      console.log('🏷️ Final auto-tagging values - Category:', autoTaggedCategory, 'Emoji:', categoryEmoji);
      
      // Create initial project_data entry
      const initialProjectData = {
        system_prompt: "You are a helpful AI voice assistant. Provide clear, accurate, and helpful responses to user questions while maintaining a professional yet friendly conversational tone.",
        agent_instructions: '',
        first_message_mode: 'wait' as const,
        llm_provider: 'openai' as const,
        llm_model: 'gpt-4o-mini',
        llm_temperature: 0.7,
        llm_max_response_length: 300 as const,
        stt_provider: 'deepgram' as const,
        stt_language: 'en' as const,
        stt_quality: 'enhanced' as const,
        stt_processing_mode: 'streaming' as const,
        stt_noise_suppression: true,
        stt_auto_punctuation: true,
        tts_provider: 'cartesia' as const,
        tts_voice: 'neutral' as const,
        phone_number: null,
        phone_inbound_enabled: true,
        phone_outbound_enabled: false,
        phone_recording_enabled: true,
        response_latency_priority: 'balanced' as const,
        knowledge_base_files: [],
        functions_enabled: false,
        custom_functions: [],
        webhooks_enabled: false,
        webhook_url: null,
        webhook_events: [],
        
        // Auto-tagging fields
        project_emoji: categoryEmoji, // Use the emoji based on the auto-tagged category
      };
      
      console.log('🚀 About to create project data with the following payload:');
      console.log('🚀 initialProjectData keys:', Object.keys(initialProjectData));
      console.log('🚀 initialProjectData.project_emoji:', initialProjectData.project_emoji);
      console.log('🚀 Full initialProjectData object:', JSON.stringify(initialProjectData, null, 2));
      
      await createProjectData(project.id, initialProjectData);
      console.log('✅ Created initial project configuration');
      
      // Now update the project with the category
      console.log('🏷️ Updating project with category:', autoTaggedCategory);
      try {
        await updateProject(project.id, { 
          category: autoTaggedCategory,
          project_emoji: categoryEmoji 
        });
        console.log('✅ Project category and emoji updated successfully');
      } catch (categoryError) {
        console.error('❌ Error updating project category:', categoryError);
        // Don't fail the entire process if category update fails
      }
      
      // Navigate directly to the project console
      router.push(`/projects/${project.id}`);
      
      // Invalidate the user's projects cache to show the new project
      await invalidateProjectsCache('project_created');
      
    } catch (error) {
      console.error('Error creating new project:', error);
    } finally {
      setCreatingProject(false);
    }
  };

  // Clear auth state utility function
  const clearAuthState = () => {
    try {
      localStorage.removeItem('sb-auth-token-access-token');
      localStorage.removeItem('sb-auth-token-refresh-token');
      sessionStorage.removeItem('sb-auth-token-access-token');
      sessionStorage.removeItem('sb-auth-token-refresh-token');
      console.log('🧹 Auth state cleared');
    } catch (error) {
      console.warn('Failed to clear auth state:', error);
    }
  };

  // Expose clearAuthState to window for debugging
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).clearAuthState = clearAuthState;
      (window as any).refreshProjects = refreshProjects;
    }
  }, [refreshProjects]);

  // Simple authentication timeout to prevent endless loading
  useEffect(() => {
    if (loading) {
      const authTimeout = setTimeout(() => {
        console.log('⏰ Authentication timeout reached, clearing state and redirecting');
        clearAuthState();
        router.push('/');
      }, 6000); // 6 second timeout

      return () => clearTimeout(authTimeout);
    }
  }, [loading, router]);

  // Redirect unauthenticated users to landing
  useEffect(() => {
    console.log('🔄 Redirect effect triggered:', {
      loading,
      user: !!user
    });
    
    if (!loading && !user) {
      console.log('🔄 Redirecting unauthenticated user to landing page');
      router.push('/');
    } else if (!loading && user) {
      console.log('✅ User authenticated, staying on projects page', {
        userId: user.id,
        email: user.email
      });
    }
  }, [user, loading, router]);

  if (loading || (user && loadingProjects)) {
    console.log('🔄 Showing loading state:', {
      loading,
      user: !!user,
      loadingProjects,
      reason: loading ? 'auth loading' : 'projects loading'
    });
    return <LoadingBun message="Loading projects..." />;
  }

  if (!user) {
    console.log('🚫 No user, returning null (should redirect):', {
      loading,
      user: !!user,
      creatingProject
    });
    return null; // Will redirect
  }

  console.log('✅ Rendering projects page:', {
    loading,
    user: !!user,
    userId: user?.id,
    projectsCount: projects.length,
    loadingProjects
  });

  return (
    <div className="min-h-screen bg-black" style={{ 
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    }}>
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Image 
              src="/VoiceBun-White.png" 
              alt="VoiceBun" 
              width={120}
              height={40}
              className="h-10 w-auto cursor-pointer"
              onClick={() => router.push('/')}
            />
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/projects')}
              className="text-white hover:text-white transition-colors"
            >
              Projects
            </button>
            <button
              onClick={() => router.push('/community')}
              className="text-white/70 hover:text-white transition-colors"
            >
              Community
            </button>
            <UserProfile />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 pt-24">
        {projects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <div className="text-6xl mb-4">🤖</div>
            <h2 className="text-2xl font-bold text-white mb-4">No projects yet</h2>
            <p className="text-white/70 mb-8 max-w-md mx-auto">
              Create your first voice agent to get started. It only takes a few minutes!
            </p>
            <button
              onClick={handleCreateNewProject}
              disabled={creatingProject}
              className="bg-white text-black px-6 py-3 rounded-lg hover:bg-gray-100 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creatingProject ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black mr-2"></div>
                  Creating...
                </div>
              ) : (
                'Create Your First Agent'
              )}
            </button>
          </motion.div>
        ) : (
          <div>
            {/* Title outside the white box */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-16"
            >
              <h1 
                className="text-4xl md:text-5xl font-bold text-white mb-4"
              >
                Your Voice Agents
              </h1>
            </motion.div>

            <CommunityProjectsSection 
              projectType="user"
              variant="full-page"
              title=""
              showSearch={true}
              showFilters={false}
              gridCols="auto"
            />
            
            {/* Floating Create Button */}
            <div className="fixed bottom-8 right-8 z-50">
              <button
                onClick={handleCreateNewProject}
                disabled={creatingProject}
                className="bg-white text-black px-6 py-3 rounded-full shadow-2xl hover:bg-gray-100 transition-all duration-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 hover:scale-105"
              >
                {creatingProject ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div>
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>New Project</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Delete Project Modal */}
      <DeleteProjectModal
        isOpen={deleteModal.isOpen}
        onClose={closeDeleteModal}
        onConfirm={confirmDeleteProject}
        projectName={deleteModal.project?.name || ''}
        isDeleting={deleteModal.isDeleting}
      />
    </div>
  );
} 