import { useState, useCallback, useRef, useEffect } from 'react';
import { ClientDatabaseService } from '@/lib/database/client-service';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Project, 
  ChatSession, 
  ChatMessage, 
  VoiceAgentConfig as VoiceAgentConfigType 
} from '@/lib/database/types';

// Create singleton instance outside the hook to prevent multiple instances
const dbInstance = new ClientDatabaseService();

export function useDatabase() {
  const { user } = useAuth();
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  
  // Use refs to track component state and prevent race conditions
  const isMountedRef = useRef(true);
  const pendingOperationsRef = useRef(new Map<string, Promise<any>>());
  const operationTimeoutsRef = useRef(new Map<string, NodeJS.Timeout>());

  // Helper function to safely update state only if component is mounted
  const safeSetState = useCallback(<T>(setter: React.Dispatch<React.SetStateAction<T>>, value: React.SetStateAction<T>) => {
    if (isMountedRef.current) {
      setter(value);
    }
  }, []);

  // Cleanup function for pending operations
  const cleanupOperation = useCallback((operationId: string) => {
    pendingOperationsRef.current.delete(operationId);
    const timeout = operationTimeoutsRef.current.get(operationId);
    if (timeout) {
      clearTimeout(timeout);
      operationTimeoutsRef.current.delete(operationId);
    }
  }, []);

  // Generic operation wrapper to prevent duplicates and handle cleanup
  const executeOperation = useCallback(async <T>(
    operationId: string,
    operation: () => Promise<T>,
    timeoutMs: number = 5000
  ): Promise<T> => {
    // Check if operation is already pending
    const existingOperation = pendingOperationsRef.current.get(operationId);
    if (existingOperation) {
      console.log(`🔄 Operation ${operationId} already in progress, returning existing promise`);
      return existingOperation as Promise<T>;
    }

    // Create operation promise with timeout
    const operationPromise = new Promise<T>(async (resolve, reject) => {
      // Set timeout for operation
      const timeout = setTimeout(() => {
        cleanupOperation(operationId);
        reject(new Error(`Operation ${operationId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      
      operationTimeoutsRef.current.set(operationId, timeout);

      try {
        const result = await operation();
        cleanupOperation(operationId);
        resolve(result);
      } catch (error) {
        cleanupOperation(operationId);
        reject(error);
      }
    });

    // Store the operation
    pendingOperationsRef.current.set(operationId, operationPromise);
    
    return operationPromise;
  }, [cleanupOperation]);

  // Component cleanup effect
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      console.log('🧹 Cleaning up useDatabase hook');
      isMountedRef.current = false;
      
      // Clear all pending operations
      pendingOperationsRef.current.clear();
      
      // Clear all timeouts
      operationTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      operationTimeoutsRef.current.clear();
    };
  }, []);

  // Create a new project when user generates an agent
  const createProject = useCallback(async (
    name: string,
    description: string,
    prompt: string,
    config: VoiceAgentConfigType,
    generatedCode: string,
    visibility: 'public' | 'private' = 'private'
  ): Promise<Project> => {
    if (!user) throw new Error('User not authenticated');

    // Create unique operation ID based on content and timestamp
    const operationId = `create_project_${user.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return executeOperation(operationId, async () => {
      console.log('🆕 Creating new project:', name);

      const project = await dbInstance.createProject({
        name,
        description,
        initial_prompt: prompt,
        config: config as any,
        visibility
      });

      console.log('✅ Project created successfully:', project.id);
      if (isMountedRef.current) {
        setCurrentProject(project);
      }
      
      return project;
    });
  }, [user, executeOperation, safeSetState]);

  // Start a new chat session (simplified - no chat sessions for now)
  const startChatSession = useCallback(async (projectId: string): Promise<any> => {
    if (!user) throw new Error('User not authenticated');

    const operationId = `start_chat_${user.id}_${projectId}_${Date.now()}`;
    
    return executeOperation(operationId, async () => {
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
      
      if (isMountedRef.current) {
        setCurrentSession(mockSession);
      }
      return mockSession;
    });
  }, [user, executeOperation]);

  // Add a message to the current session (simplified - no messages table for now)
  const addChatMessage = useCallback(async (
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    isCheckpoint: boolean = false
  ): Promise<any> => {
    if (!user) throw new Error('User not authenticated');

    const operationId = `add_message_${sessionId}_${Date.now()}`;
    
    return executeOperation(operationId, async () => {
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
    });
  }, [user, executeOperation]);

  // Get user's projects
  const getUserProjects = useCallback(async () => {
    if (!user) throw new Error('User not authenticated');
    
    const operationId = `get_projects_${user.id}_${Date.now()}`;
    
    return executeOperation(operationId, async () => {
      return await dbInstance.getUserProjects();
    });
  }, [user, executeOperation]);

  // Update project
  const updateProject = useCallback(async (projectId: string, updates: any) => {
    if (!user) throw new Error('User not authenticated');
    
    const operationId = `update_project_${projectId}_${Date.now()}`;
    
    return executeOperation(operationId, async () => {
      return await dbInstance.updateProject(projectId, updates);
    });
  }, [user, executeOperation]);

  // Project Data Management
  const createProjectData = useCallback(async (projectId: string, data: any) => {
    if (!user) throw new Error('User not authenticated');
    
    const operationId = `create_data_${projectId}_${Date.now()}`;
    
    return executeOperation(operationId, async () => {
      return await dbInstance.createProjectData(projectId, data);
    });
  }, [user, executeOperation]);

  const getProjectData = useCallback(async (projectId: string) => {
    if (!user) throw new Error('User not authenticated');
    
    const operationId = `get_data_${projectId}_${Date.now()}`;
    
    return executeOperation(operationId, async () => {
      return await dbInstance.getProjectData(projectId);
    });
  }, [user, executeOperation]);

  const updateProjectData = useCallback(async (projectId: string, updates: any) => {
    if (!user) throw new Error('User not authenticated');
    
    const operationId = `update_data_${projectId}_${Date.now()}`;
    
    return executeOperation(operationId, async () => {
      return await dbInstance.updateProjectData(projectId, updates);
    });
  }, [user, executeOperation]);

  const getProjectDataHistory = useCallback(async (projectId: string) => {
    if (!user) throw new Error('User not authenticated');
    
    const operationId = `get_history_${projectId}_${Date.now()}`;
    
    return executeOperation(operationId, async () => {
      return await dbInstance.getProjectDataHistory(projectId);
    });
  }, [user, executeOperation]);

  const getProjectPhoneNumbers = useCallback(async (projectId: string) => {
    if (!user) throw new Error('User not authenticated');
    
    const operationId = `get_phone_${projectId}_${Date.now()}`;
    
    return executeOperation(operationId, async () => {
      return await dbInstance.getProjectPhoneNumbers(projectId);
    });
  }, [user, executeOperation]);

  const getUserPhoneNumbers = useCallback(async () => {
    if (!user) throw new Error('User not authenticated');
    
    const operationId = `get_user_phone_${user.id}_${Date.now()}`;
    
    return executeOperation(operationId, async () => {
      return await dbInstance.getUserPhoneNumbers();
    });
  }, [user, executeOperation]);

  const getUserPlan = useCallback(async () => {
    if (!user) throw new Error('User not authenticated');
    
    const operationId = `get_plan_${user.id}_${Date.now()}`;
    
    return executeOperation(operationId, async () => {
      return await dbInstance.getUserPlan();
    });
  }, [user, executeOperation]);

  const updateUserPlan = useCallback(async (updates: any) => {
    if (!user) throw new Error('User not authenticated');
    
    const operationId = `update_plan_${user.id}_${Date.now()}`;
    
    return executeOperation(operationId, async () => {
      return await dbInstance.updateUserPlan(user.id, updates);
    });
  }, [user, executeOperation]);

  const updateConversationMinutes = useCallback(async (minutesUsed: number) => {
    if (!user) throw new Error('User not authenticated');
    
    const operationId = `update_minutes_${user.id}_${Date.now()}`;
    
    return executeOperation(operationId, async () => {
      return await dbInstance.updateConversationMinutes(user.id, minutesUsed);
    });
  }, [user, executeOperation]);

  // Custom Voice Management
  const getUserCustomVoices = useCallback(async () => {
    if (!user) throw new Error('User not authenticated');
    
    const operationId = `get_voices_${user.id}_${Date.now()}`;
    
    return executeOperation(operationId, async () => {
      return await dbInstance.getUserCustomVoices();
    });
  }, [user, executeOperation]);

  const addCustomVoiceToUserPlan = useCallback(async (voice: { id: string; displayName: string; createdAt: string }) => {
    if (!user) throw new Error('User not authenticated');
    
    const operationId = `add_voice_${user.id}_${voice.id}_${Date.now()}`;
    
    return executeOperation(operationId, async () => {
      return await dbInstance.addCustomVoiceToUserPlan(voice);
    });
  }, [user, executeOperation]);

  const removeCustomVoiceFromUserPlan = useCallback(async (voiceId: string) => {
    if (!user) throw new Error('User not authenticated');
    
    const operationId = `remove_voice_${user.id}_${voiceId}_${Date.now()}`;
    
    return executeOperation(operationId, async () => {
      return await dbInstance.removeCustomVoiceFromUserPlan(voiceId);
    });
  }, [user, executeOperation]);

  const deleteProject = useCallback(async (projectId: string) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    const operationId = `delete_project_${projectId}_${Date.now()}`;
    
    return executeOperation(operationId, async () => {
      const response = await fetch('/api/delete-project', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          userId: user.id
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete project');
      }

      return result;
    });
  }, [user, executeOperation]);

  return {
    createProject,
    startChatSession,
    addChatMessage,
    getUserProjects,
    createProjectData,
    getProjectData,
    updateProjectData,
    getProjectDataHistory,
    getProjectPhoneNumbers,
    getUserPhoneNumbers,
    getUserPlan,
    updateUserPlan,
    updateConversationMinutes,
    getUserCustomVoices,
    addCustomVoiceToUserPlan,
    removeCustomVoiceFromUserPlan,
    deleteProject,
    currentProject,
    currentSession,
    setCurrentProject,
    setCurrentSession,
    updateProject
  };
} 