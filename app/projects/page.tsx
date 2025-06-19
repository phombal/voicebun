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
  const { getUserProjects, createProject, createProjectData, deleteProject } = useDatabase();
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
      await deleteProject(deleteModal.project.id);
      
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
        webhook_events: []
      };
      
      await createProjectData(project.id, initialProjectData);
      console.log('✅ Created initial project configuration');
      
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
              className="text-white/70 hover:text-white transition-colors"
            >
              Projects
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
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between mb-8"
            >
              <div>
                <h2 className="text-2xl font-bold text-white">Your Voice Agents</h2>
                <p className="text-white/70">
                  {projects.length} {projects.length === 1 ? 'project' : 'projects'}
                </p>
              </div>
              <button
                onClick={handleCreateNewProject}
                disabled={creatingProject}
                className="bg-white text-black px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingProject ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black mr-2"></div>
                    Creating...
                  </div>
                ) : (
                  'New Project'
                )}
              </button>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {projects.map((project, index) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl hover:border-white/30 transition-all duration-200 group relative"
                  style={{ overflow: 'visible' }}
                >
                  <div 
                    className="cursor-pointer"
                    onClick={() => router.push(`/projects/${project.id}`)}
                  >
                    <div className="aspect-video bg-gradient-to-br from-blue-500 to-purple-600 relative overflow-hidden">
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
                      <div className="flex items-center justify-between text-xs text-white/60">
                        <span>
                          Created {new Date(project.created_at).toLocaleDateString()} at {new Date(project.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Dropdown Menu */}
                  <div className="absolute top-2 left-2 z-20">
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          console.log('🔽 Dropdown toggle clicked for project:', project.name);
                          e.stopPropagation();
                          setOpenDropdown(openDropdown === project.id ? null : project.id);
                        }}
                        className="bg-black/20 backdrop-blur-sm rounded-full p-1.5 hover:bg-black/30 transition-colors"
                      >
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                      </button>

                      {openDropdown === project.id && (
                        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-[100] min-w-[120px]">
                          <button
                            onClick={(e) => {
                              console.log('🗑️ Delete button in dropdown clicked for project:', project.name);
                              e.stopPropagation();
                              handleDeleteProject(project);
                            }}
                            className="w-full px-3 py-2 text-left text-red-400 hover:bg-gray-700 transition-colors text-sm flex items-center rounded-lg"
                          >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
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