'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Project as DatabaseProject } from '@/lib/database/types';
import { VoiceAgentConfig as VoiceAgentConfigType } from '@/lib/database/types';
import { useDatabase } from '@/hooks/useDatabase';
import UserProfile from '@/components/auth/UserProfile';
import DeleteProjectModal from '@/components/DeleteProjectModal';
import { LoadingBun } from '@/components/LoadingBun';
import CommunityProjectsSection from '@/components/CommunityProjectsSection';

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
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

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

  const handleDeleteProject = (project: Project) => {
    console.log('🗑️ Delete button clicked for project:', project.name);
    setDeleteModal({
      isOpen: true,
      project,
      isDeleting: false
    });
    setOpenDropdown(null);
  };

  const confirmDeleteProject = async () => {
    if (!deleteModal.project) return;

    setDeleteModal(prev => ({ ...prev, isDeleting: true }));

    try {
      await deleteProjectFromDB(deleteModal.project.id);
      
      // Remove the project from the local state
      setProjects(prev => prev.filter(p => p.id !== deleteModal.project!.id));
      
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
    if (!user || creatingProject) return;
    
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
      
    } catch (error) {
      console.error('Error creating new project:', error);
    } finally {
      setCreatingProject(false);
    }
  };

  if (loading || (user && loadingProjects)) {
    return <LoadingBun message="Loading projects..." />;
  }

  if (!user) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-black" style={{ 
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    }}>
      {/* Header */}
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
              className="text-white hover:text-white transition-colors"
            >
              Projects
            </a>
            <a
              href="/community"
              className="text-white/70 hover:text-white transition-colors"
            >
              Community
            </a>
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
              className="mb-12"
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

      {/* Click outside to close dropdown */}
      {/* Temporarily disabled to test dropdown functionality
      {openDropdown && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => {
            console.log('🔄 Click outside detected, closing dropdown');
            setOpenDropdown(null);
          }}
        />
      )}
      */}
    </div>
  );
} 