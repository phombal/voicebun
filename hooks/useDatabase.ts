import { useState, useCallback, useRef } from 'react';
import { DatabaseService } from '@/lib/database/service';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Project, 
  ChatSession, 
  ChatMessage, 
  VoiceAgentConfig as VoiceAgentConfigType 
} from '@/lib/database/types';

// Create singleton instance outside the hook to prevent multiple instances
const dbInstance = new DatabaseService();

// Global state to prevent concurrent project creation
let isCreatingProjectGlobally = false;
const pendingProjectCreations = new Map<string, Promise<Project>>();

export function useDatabase() {
  const { user } = useAuth();
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);

  // Create a new project when user generates an agent
  const createProject = useCallback(async (
    name: string,
    description: string,
    prompt: string,
    config: VoiceAgentConfigType,
    generatedCode: string
  ): Promise<Project> => {
    if (!user) throw new Error('User not authenticated');

    try {
      // Create a unique key based on timestamp to prevent only rapid duplicate clicks
      const projectKey = `${Date.now()}_${Math.random()}`;
      
      // Only prevent rapid duplicate creation within a very short timeframe (same second)
      const rapidDuplicateKey = `${prompt.substring(0, 50)}_${Math.floor(Date.now() / 1000)}`;
      
      // Check if there's already a pending creation for this exact project within the same second
      if (pendingProjectCreations.has(rapidDuplicateKey)) {
        console.log('🔄 Preventing rapid duplicate creation...');
        return await pendingProjectCreations.get(rapidDuplicateKey)!;
      }

      // Prevent very rapid concurrent creation (within same second)
      if (isCreatingProjectGlobally) {
        console.log('🔄 Another project creation in progress, waiting briefly...');
        await new Promise(resolve => setTimeout(resolve, 50));
        // Reset the global flag and allow creation
        isCreatingProjectGlobally = false;
      }

      isCreatingProjectGlobally = true;

      // Always create a new project - users should be able to create multiple similar projects
      console.log('🆕 Creating new project:', name);

      // Create the project creation promise and store it with rapid duplicate key
      const creationPromise = dbInstance.createProject({
        name,
        description,
        initial_prompt: prompt,
        config: config as any
      });

      pendingProjectCreations.set(rapidDuplicateKey, creationPromise);

      const project = await creationPromise;

      console.log('✅ Project created successfully:', project.id);
      setCurrentProject(project);
      
      // Cleanup - remove after a short delay to prevent rapid duplicates
      setTimeout(() => {
        pendingProjectCreations.delete(rapidDuplicateKey);
      }, 1000);
      
      isCreatingProjectGlobally = false;
      
      return project;
    } catch (error) {
      console.error('❌ Failed to create project:', error);
      isCreatingProjectGlobally = false;
      // Clear pending creation on error
      pendingProjectCreations.clear();
      throw error;
    }
  }, [user]);

  // Start a new chat session (simplified - no chat sessions for now)
  const startChatSession = useCallback(async (projectId: string): Promise<any> => {
    if (!user) throw new Error('User not authenticated');

    // For now, just return a mock session since we don't have chat_sessions table
    const mockSession: ChatSession = {
      id: `session_${Date.now()}`,
        project_id: projectId,
      user_id: user.id,
      title: `Chat Session - ${new Date().toLocaleString()}`,
      started_at: new Date().toISOString(),
      ended_at: null,
      is_active: true,
      message_count: 0,
      metadata: {}
    };
    
    setCurrentSession(mockSession);
    return mockSession;
  }, [user]);

  // Add a message to the current session (simplified - no messages table for now)
  const addChatMessage = useCallback(async (
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    isCheckpoint: boolean = false
  ): Promise<any> => {
    if (!user) throw new Error('User not authenticated');

    // For now, just return a mock message since we don't have chat_messages table
    const mockMessage = {
      id: `msg_${Date.now()}`,
        session_id: sessionId,
        role,
        content,
      is_checkpoint: isCheckpoint,
      created_at: new Date().toISOString(),
      metadata: {}
    };

    return mockMessage;
  }, [user]);

  // Get user's projects
  const getUserProjects = useCallback(async () => {
    if (!user) throw new Error('User not authenticated');
    return await dbInstance.getUserProjects();
  }, [user]);

  // Project Data Management
  const createProjectData = useCallback(async (projectId: string, data: any) => {
    if (!user) throw new Error('User not authenticated');
    return await dbInstance.createProjectData(projectId, data);
  }, [user]);

  const getProjectData = useCallback(async (projectId: string) => {
    if (!user) throw new Error('User not authenticated');
    return await dbInstance.getProjectData(projectId);
  }, [user]);

  const updateProjectData = useCallback(async (projectId: string, updates: any) => {
    if (!user) throw new Error('User not authenticated');
    return await dbInstance.updateProjectData(projectId, updates);
  }, [user]);

  const getProjectDataHistory = useCallback(async (projectId: string) => {
    if (!user) throw new Error('User not authenticated');
    return await dbInstance.getProjectDataHistory(projectId);
  }, [user]);

  return {
    createProject,
    startChatSession,
    addChatMessage,
    getUserProjects,
    createProjectData,
    getProjectData,
    updateProjectData,
    getProjectDataHistory,
    currentProject,
    currentSession,
    setCurrentProject,
    setCurrentSession
  };
} 