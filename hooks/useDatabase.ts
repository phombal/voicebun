import { useState, useCallback } from 'react';
import { DatabaseService } from '@/lib/database/service';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Project, 
  ChatSession, 
  ChatMessage, 
  VoiceAgentConfig as VoiceAgentConfigType 
} from '@/lib/database/types';

export function useDatabase() {
  const { user } = useAuth();
  const [db] = useState(() => new DatabaseService());
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
      // First, ensure user profile exists
      try {
        let userProfile = await db.getUserProfile();
        if (!userProfile) {
          console.log('🔄 Creating user profile...');
          userProfile = await db.createUserProfile({
            id: user.id,
            email: user.email || null,
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || null,
            avatar_url: user.user_metadata?.avatar_url || null
          });
          console.log('✅ User profile created:', userProfile.id);
        } else {
          console.log('✅ User profile exists:', userProfile.id);
        }
      } catch (profileError) {
        console.error('❌ Failed to ensure user profile exists:', profileError);
        throw new Error('Failed to create user profile. Please try again.');
      }

      // Then, create the project
      const project = await db.createProject({
        name,
        description,
        initial_prompt: prompt,
        config: config as any
      });

      console.log('✅ Project created successfully:', project.id);

      // Then create project files (but don't fail if this fails)
      try {
        // Create initial project files
        await db.createProjectFile(project.id, {
          file_path: 'voice_agent.py',
          file_name: 'voice_agent.py',
          content: generatedCode,
          file_type: 'file'
        });

        // Create requirements.txt
        const requirementsContent = `livekit-agents
livekit-plugins-openai
livekit-plugins-deepgram
livekit-plugins-cartesia
livekit-plugins-silero
python-dotenv`;

        await db.createProjectFile(project.id, {
          file_path: 'requirements.txt',
          file_name: 'requirements.txt',
          content: requirementsContent,
          file_type: 'file'
        });

        // Create .env.example
        const envExampleContent = `# LiveKit Configuration
LIVEKIT_URL=wss://your-livekit-server.com
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret

# AI Service API Keys
OPENAI_API_KEY=your-openai-api-key
DEEPGRAM_API_KEY=your-deepgram-api-key
CARTESIA_API_KEY=your-cartesia-api-key`;

        await db.createProjectFile(project.id, {
          file_path: '.env.example',
          file_name: '.env.example',
          content: envExampleContent,
          file_type: 'file'
        });

        // Create README.md
        const readmeContent = `# Voice Agent

This is an AI-powered voice agent built with LiveKit.

## Setup

1. Install dependencies:
   \`\`\`bash
   pip install -r requirements.txt
   \`\`\`

2. Copy \`.env.example\` to \`.env\` and fill in your API keys:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

3. Run the agent:
   \`\`\`bash
   python voice_agent.py
   \`\`\`

## Configuration

- **Prompt**: ${config.prompt}
- **Personality**: ${config.personality}
- **Language**: ${config.language}
- **Response Style**: ${config.responseStyle}
- **Capabilities**: ${config.capabilities.join(', ') || 'None specified'}

## Agent Description

${config.prompt}
`;

        await db.createProjectFile(project.id, {
          file_path: 'README.md',
          file_name: 'README.md',
          content: readmeContent,
          file_type: 'file'
        });

        console.log('✅ Project files created successfully in database');
      } catch (fileError) {
        console.warn('⚠️ Failed to create some project files in database:', fileError);
        // Don't throw here - the project was created successfully
      }

      setCurrentProject(project);
      return project;
    } catch (error) {
      console.error('❌ Failed to create project:', error);
      throw error;
    }
  }, [user, db]);

  // Start a new chat session
  const startChatSession = useCallback(async (projectId: string): Promise<ChatSession> => {
    if (!user) throw new Error('User not authenticated');

    try {
      // Ensure user profile exists
      let userProfile = await db.getUserProfile();
      if (!userProfile) {
        console.log('🔄 Creating user profile for chat session...');
        userProfile = await db.createUserProfile({
          id: user.id,
          email: user.email || null,
          full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || null,
          avatar_url: user.user_metadata?.avatar_url || null
        });
        console.log('✅ User profile created for chat session:', userProfile.id);
      }

      const session = await db.createChatSession({
        project_id: projectId,
        title: `Chat Session - ${new Date().toLocaleString()}`
      });

      setCurrentSession(session);
      return session;
    } catch (error) {
      console.error('❌ Failed to start chat session:', error);
      throw error;
    }
  }, [user, db]);

  // Add a message to the current session
  const addChatMessage = useCallback(async (
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    isCheckpoint: boolean = false
  ): Promise<ChatMessage> => {
    if (!user) throw new Error('User not authenticated');

    try {
      // Ensure user profile exists
      let userProfile = await db.getUserProfile();
      if (!userProfile) {
        console.log('🔄 Creating user profile for chat message...');
        userProfile = await db.createUserProfile({
          id: user.id,
          email: user.email || null,
          full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || null,
          avatar_url: user.user_metadata?.avatar_url || null
        });
        console.log('✅ User profile created for chat message:', userProfile.id);
      }

      const message = await db.createChatMessage({
        session_id: sessionId,
        role,
        content,
        is_checkpoint: isCheckpoint
      });

      return message;
    } catch (error) {
      console.error('❌ Failed to add chat message:', error);
      throw error;
    }
  }, [user, db]);

  // Update project files when code changes
  const updateProjectFiles = useCallback(async (
    projectId: string,
    sessionId: string,
    messageId: string,
    files: Array<{ path: string; name: string; content: string; type: 'file' | 'folder' }>,
    changeDescription?: string
  ): Promise<void> => {
    if (!user) throw new Error('User not authenticated');

    await db.syncVirtualFileSystemToDatabase(
      projectId,
      sessionId,
      messageId,
      files,
      changeDescription
    );
  }, [user, db]);

  // Get user's projects
  const getUserProjects = useCallback(async () => {
    if (!user) throw new Error('User not authenticated');
    return await db.getUserProjects();
  }, [user, db]);

  // Get project chat sessions
  const getProjectSessions = useCallback(async (projectId: string) => {
    if (!user) throw new Error('User not authenticated');
    return await db.getProjectChatSessions(projectId);
  }, [user, db]);

  // Get session messages
  const getSessionMessages = useCallback(async (sessionId: string) => {
    if (!user) throw new Error('User not authenticated');
    return await db.getSessionMessages(sessionId);
  }, [user, db]);

  return {
    createProject,
    startChatSession,
    addChatMessage,
    updateProjectFiles,
    getUserProjects,
    getProjectSessions,
    getSessionMessages,
    currentProject,
    currentSession,
    setCurrentProject,
    setCurrentSession
  };
} 