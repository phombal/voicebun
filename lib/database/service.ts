import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  Database, 
  Project, 
  ChatSession, 
  ChatMessage, 
  ProjectFile, 
  FileSnapshot,
  ProjectSnapshot,
  CodeChange,
  UserProfile,
  CreateProjectRequest,
  CreateSessionRequest,
  CreateMessageRequest,
  UpdateFileRequest,
  CreateFileRequest,
  PaginationParams,
  PaginatedResponse,
  ProjectFilters,
  ChatSessionFilters,
  MessageFilters,
  ProjectOverview,
  RecentChatActivity,
  FileChangeHistory
} from './types';

export class DatabaseService {
  private supabase: SupabaseClient<Database>;

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    this.supabase = createClient<Database>(supabaseUrl, supabaseKey);
  }

  // Auth helpers
  async getCurrentUser() {
    const { data: { user }, error } = await this.supabase.auth.getUser();
    if (error) throw error;
    return user;
  }

  async getCurrentUserId(): Promise<string> {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');
    return user.id;
  }

  // User Profile Management
  async createUserProfile(profile: Omit<UserProfile, 'created_at' | 'updated_at'>): Promise<UserProfile> {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .insert(profile)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async getUserProfile(userId?: string): Promise<UserProfile | null> {
    const id = userId || await this.getCurrentUserId();
    
    const { data, error } = await this.supabase
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
    return data;
  }

  async updateUserProfile(updates: Partial<Omit<UserProfile, 'id' | 'created_at'>>): Promise<UserProfile> {
    const userId = await this.getCurrentUserId();
    
    const { data, error } = await this.supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  // Project Management
  async createProject(request: CreateProjectRequest): Promise<Project> {
    const userId = await this.getCurrentUserId();
    
    const { data, error } = await this.supabase
      .from('projects')
      .insert({
        user_id: userId,
        name: request.name,
        description: request.description || null,
        initial_prompt: request.initial_prompt,
        config: request.config
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async getProject(projectId: string): Promise<Project | null> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async getUserProjects(
    filters: ProjectFilters = {},
    pagination: PaginationParams = {}
  ): Promise<PaginatedResponse<ProjectOverview>> {
    const userId = await this.getCurrentUserId();
    const { page = 1, limit = 20, sort_by = 'updated_at', sort_order = 'desc' } = pagination;
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from('project_overview')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    // Apply filters
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
    }
    if (filters.created_after) {
      query = query.gte('created_at', filters.created_after);
    }
    if (filters.created_before) {
      query = query.lte('created_at', filters.created_before);
    }

    // Apply sorting and pagination
    query = query
      .order(sort_by, { ascending: sort_order === 'asc' })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    
    if (error) throw error;

    return {
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit),
        has_next: offset + limit < (count || 0),
        has_prev: page > 1
      }
    };
  }

  async updateProject(projectId: string, updates: Partial<Omit<Project, 'id' | 'created_at'>>): Promise<Project> {
    const { data, error } = await this.supabase
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateProjectAccess(projectId: string): Promise<void> {
    await this.updateProject(projectId, { last_accessed_at: new Date().toISOString() });
  }

  async deleteProject(projectId: string): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .update({ status: 'deleted' })
      .eq('id', projectId);
    
    if (error) throw error;
  }

  // Chat Session Management
  async createChatSession(request: CreateSessionRequest): Promise<ChatSession> {
    const userId = await this.getCurrentUserId();
    
    // End any active sessions for this project
    await this.supabase
      .from('chat_sessions')
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq('project_id', request.project_id)
      .eq('user_id', userId)
      .eq('is_active', true);

    const { data, error } = await this.supabase
      .from('chat_sessions')
      .insert({
        project_id: request.project_id,
        user_id: userId,
        title: request.title || null,
        is_active: true,
        metadata: {}
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async getChatSession(sessionId: string): Promise<ChatSession | null> {
    const { data, error } = await this.supabase
      .from('chat_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async getProjectChatSessions(
    projectId: string,
    filters: ChatSessionFilters = {},
    pagination: PaginationParams = {}
  ): Promise<PaginatedResponse<ChatSession>> {
    const { page = 1, limit = 20, sort_by = 'started_at', sort_order = 'desc' } = pagination;
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from('chat_sessions')
      .select('*', { count: 'exact' })
      .eq('project_id', projectId);

    // Apply filters
    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }
    if (filters.started_after) {
      query = query.gte('started_at', filters.started_after);
    }
    if (filters.started_before) {
      query = query.lte('started_at', filters.started_before);
    }

    // Apply sorting and pagination
    query = query
      .order(sort_by, { ascending: sort_order === 'asc' })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    
    if (error) throw error;

    return {
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit),
        has_next: offset + limit < (count || 0),
        has_prev: page > 1
      }
    };
  }

  async getActiveSession(projectId: string): Promise<ChatSession | null> {
    const userId = await this.getCurrentUserId();
    
    const { data, error } = await this.supabase
      .from('chat_sessions')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async endChatSession(sessionId: string): Promise<ChatSession> {
    const { data, error } = await this.supabase
      .from('chat_sessions')
      .update({ 
        is_active: false, 
        ended_at: new Date().toISOString() 
      })
      .eq('id', sessionId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  // Chat Message Management
  async createChatMessage(request: CreateMessageRequest): Promise<ChatMessage> {
    const userId = await this.getCurrentUserId();
    
    const { data, error } = await this.supabase
      .from('chat_messages')
      .insert({
        session_id: request.session_id,
        user_id: userId,
        role: request.role,
        content: request.content,
        is_checkpoint: request.is_checkpoint || false,
        context_data: request.context_data || {},
        metadata: request.metadata || {}
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async getSessionMessages(
    sessionId: string,
    filters: MessageFilters = {},
    pagination: PaginationParams = {}
  ): Promise<PaginatedResponse<ChatMessage>> {
    const { page = 1, limit = 50, sort_by = 'timestamp', sort_order = 'asc' } = pagination;
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from('chat_messages')
      .select('*', { count: 'exact' })
      .eq('session_id', sessionId);

    // Apply filters
    if (filters.role) {
      query = query.eq('role', filters.role);
    }
    if (filters.is_checkpoint !== undefined) {
      query = query.eq('is_checkpoint', filters.is_checkpoint);
    }
    if (filters.search) {
      query = query.ilike('content', `%${filters.search}%`);
    }
    if (filters.timestamp_after) {
      query = query.gte('timestamp', filters.timestamp_after);
    }
    if (filters.timestamp_before) {
      query = query.lte('timestamp', filters.timestamp_before);
    }

    // Apply sorting and pagination
    query = query
      .order(sort_by, { ascending: sort_order === 'asc' })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    
    if (error) throw error;

    return {
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit),
        has_next: offset + limit < (count || 0),
        has_prev: page > 1
      }
    };
  }

  async getCheckpointMessages(sessionId: string): Promise<ChatMessage[]> {
    const { data, error } = await this.supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('is_checkpoint', true)
      .order('timestamp', { ascending: true });
    
    if (error) throw error;
    return data || [];
  }

  // Project File Management
  async createProjectFile(projectId: string, request: CreateFileRequest): Promise<ProjectFile> {
    const { data, error } = await this.supabase
      .from('project_files')
      .insert({
        project_id: projectId,
        file_path: request.file_path,
        file_name: request.file_name,
        file_type: request.file_type,
        content: request.content || null,
        language: request.language || null,
        size_bytes: request.content ? new Blob([request.content]).size : 0,
        version: 1,
        parent_path: request.parent_path || null,
        is_deleted: false
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async getProjectFiles(projectId: string, includeDeleted: boolean = false): Promise<ProjectFile[]> {
    let query = this.supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId);

    if (!includeDeleted) {
      query = query.eq('is_deleted', false);
    }

    query = query.order('file_path', { ascending: true });

    const { data, error } = await query;
    
    if (error) throw error;
    return data || [];
  }

  async getProjectFile(projectId: string, filePath: string): Promise<ProjectFile | null> {
    const { data, error } = await this.supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId)
      .eq('file_path', filePath)
      .eq('is_deleted', false)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async updateProjectFile(
    projectId: string, 
    request: UpdateFileRequest,
    sessionId?: string,
    messageId?: string
  ): Promise<ProjectFile> {
    const file = await this.getProjectFile(projectId, request.file_path);
    if (!file) throw new Error('File not found');

    // Create snapshot before updating
    if (file.content !== request.content) {
      await this.createFileSnapshot({
        file_id: file.id,
        project_id: projectId,
        session_id: sessionId || null,
        message_id: messageId || null,
        content: file.content || '',
        version: file.version,
        change_description: request.change_description || null,
        diff_content: this.generateDiff(file.content || '', request.content),
        created_by_user_id: await this.getCurrentUserId()
      });
    }

    const { data, error } = await this.supabase
      .from('project_files')
      .update({
        content: request.content,
        size_bytes: new Blob([request.content]).size,
        version: file.version + 1
      })
      .eq('id', file.id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async deleteProjectFile(projectId: string, filePath: string): Promise<void> {
    const { error } = await this.supabase
      .from('project_files')
      .update({ is_deleted: true })
      .eq('project_id', projectId)
      .eq('file_path', filePath);
    
    if (error) throw error;
  }

  // File Snapshot Management
  async createFileSnapshot(snapshot: Omit<FileSnapshot, 'id' | 'created_at'>): Promise<FileSnapshot> {
    const { data, error } = await this.supabase
      .from('file_snapshots')
      .insert(snapshot)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async getFileSnapshots(fileId: string): Promise<FileSnapshot[]> {
    const { data, error } = await this.supabase
      .from('file_snapshots')
      .select('*')
      .eq('file_id', fileId)
      .order('version', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }

  async revertFileToSnapshot(fileId: string, snapshotId: string): Promise<ProjectFile> {
    const snapshot = await this.supabase
      .from('file_snapshots')
      .select('*')
      .eq('id', snapshotId)
      .single();
    
    if (snapshot.error) throw snapshot.error;

    const file = await this.supabase
      .from('project_files')
      .select('*')
      .eq('id', fileId)
      .single();
    
    if (file.error) throw file.error;

    // Create a new snapshot before reverting
    await this.createFileSnapshot({
      file_id: fileId,
      project_id: file.data.project_id,
      session_id: null,
      message_id: null,
      content: file.data.content || '',
      version: file.data.version,
      change_description: `Revert to version ${snapshot.data.version}`,
      diff_content: this.generateDiff(file.data.content || '', snapshot.data.content),
      created_by_user_id: await this.getCurrentUserId()
    });

    const { data, error } = await this.supabase
      .from('project_files')
      .update({
        content: snapshot.data.content,
        size_bytes: new Blob([snapshot.data.content]).size,
        version: file.data.version + 1
      })
      .eq('id', fileId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  // Project Snapshot Management
  async createProjectSnapshot(
    projectId: string,
    sessionId?: string,
    messageId?: string,
    name?: string,
    description?: string
  ): Promise<ProjectSnapshot> {
    const files = await this.getProjectFiles(projectId);
    const filesData = {
      files: files.map(file => ({
        path: file.file_path,
        name: file.file_name,
        type: file.file_type,
        content: file.content || '',
        version: file.version
      }))
    };

    const { data, error } = await this.supabase
      .from('project_snapshots')
      .insert({
        project_id: projectId,
        session_id: sessionId || null,
        message_id: messageId || null,
        snapshot_name: name || null,
        description: description || null,
        files_data: filesData,
        created_by_user_id: await this.getCurrentUserId()
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async getProjectSnapshots(projectId: string): Promise<ProjectSnapshot[]> {
    const { data, error } = await this.supabase
      .from('project_snapshots')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }

  async restoreProjectSnapshot(snapshotId: string): Promise<void> {
    const snapshot = await this.supabase
      .from('project_snapshots')
      .select('*')
      .eq('id', snapshotId)
      .single();
    
    if (snapshot.error) throw snapshot.error;

    // Create a new snapshot before restoring
    await this.createProjectSnapshot(
      snapshot.data.project_id,
      undefined,
      undefined,
      'Pre-restore backup',
      `Backup before restoring to snapshot ${snapshot.data.snapshot_name || snapshot.data.id}`
    );

    // Restore all files from the snapshot
    for (const fileData of snapshot.data.files_data.files) {
      const existingFile = await this.getProjectFile(snapshot.data.project_id, fileData.path);
      
      if (existingFile) {
        await this.updateProjectFile(snapshot.data.project_id, {
          file_path: fileData.path,
          content: fileData.content,
          change_description: `Restored from snapshot ${snapshot.data.snapshot_name || snapshot.data.id}`
        });
      } else {
        await this.createProjectFile(snapshot.data.project_id, {
          file_path: fileData.path,
          file_name: fileData.name,
          file_type: fileData.type as 'file' | 'folder',
          content: fileData.content
        });
      }
    }
  }

  // Code Change Tracking
  async createCodeChange(change: Omit<CodeChange, 'id' | 'created_at'>): Promise<CodeChange> {
    const { data, error } = await this.supabase
      .from('code_changes')
      .insert(change)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async getProjectCodeChanges(projectId: string): Promise<FileChangeHistory[]> {
    const { data, error } = await this.supabase
      .from('file_change_history')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }

  // Analytics and Insights
  async getRecentActivity(limit: number = 20): Promise<RecentChatActivity[]> {
    const userId = await this.getCurrentUserId();
    
    const { data, error } = await this.supabase
      .from('recent_chat_activity')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  }

  async getProjectStats(projectId: string) {
    const [project, sessions, messages, files, changes] = await Promise.all([
      this.getProject(projectId),
      this.getProjectChatSessions(projectId),
      this.supabase.from('chat_messages')
        .select('id', { count: 'exact' })
        .in('session_id', (await this.getProjectChatSessions(projectId)).data.map(s => s.id)),
      this.getProjectFiles(projectId),
      this.getProjectCodeChanges(projectId)
    ]);

    return {
      project,
      totalSessions: sessions.pagination.total,
      totalMessages: messages.count || 0,
      totalFiles: files.length,
      totalChanges: changes.length,
      lastActivity: sessions.data[0]?.started_at || project?.created_at
    };
  }

  // Utility functions
  private generateDiff(oldContent: string, newContent: string): string {
    // Simple diff implementation - in production, use a proper diff library
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    let diff = '';
    const maxLines = Math.max(oldLines.length, newLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';
      
      if (oldLine !== newLine) {
        if (oldLine && !newLine) {
          diff += `- ${oldLine}\n`;
        } else if (!oldLine && newLine) {
          diff += `+ ${newLine}\n`;
        } else if (oldLine !== newLine) {
          diff += `- ${oldLine}\n+ ${newLine}\n`;
        }
      }
    }
    
    return diff;
  }

  // Batch operations for efficiency
  async syncVirtualFileSystemToDatabase(
    projectId: string,
    sessionId: string,
    messageId: string,
    virtualFiles: Array<{ path: string; name: string; content: string; type: 'file' | 'folder' }>,
    changeDescription?: string
  ): Promise<void> {
    const existingFiles = await this.getProjectFiles(projectId);
    const existingFilePaths = new Set(existingFiles.map(f => f.file_path));

    // Process each virtual file
    for (const vFile of virtualFiles) {
      if (vFile.type === 'folder') continue; // Skip folders for now

      if (existingFilePaths.has(vFile.path)) {
        // Update existing file
        const existingFile = existingFiles.find(f => f.file_path === vFile.path);
        if (existingFile && existingFile.content !== vFile.content) {
          await this.updateProjectFile(projectId, {
            file_path: vFile.path,
            content: vFile.content,
            change_description: changeDescription
          }, sessionId, messageId);

          // Track the change
          await this.createCodeChange({
            project_id: projectId,
            session_id: sessionId,
            message_id: messageId,
            file_id: existingFile.id,
            change_type: 'update',
            old_content: existingFile.content,
            new_content: vFile.content,
            diff_content: this.generateDiff(existingFile.content || '', vFile.content),
            line_changes: null
          });
        }
      } else {
        // Create new file
        const newFile = await this.createProjectFile(projectId, {
          file_path: vFile.path,
          file_name: vFile.name,
          file_type: 'file',
          content: vFile.content,
          language: this.getLanguageFromPath(vFile.path)
        });

        // Track the change
        await this.createCodeChange({
          project_id: projectId,
          session_id: sessionId,
          message_id: messageId,
          file_id: newFile.id,
          change_type: 'create',
          old_content: null,
          new_content: vFile.content,
          diff_content: `+ ${vFile.content}`,
          line_changes: null
        });
      }
    }
  }

  private getLanguageFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'py': return 'python';
      case 'js': return 'javascript';
      case 'ts': return 'typescript';
      case 'tsx': return 'typescript';
      case 'jsx': return 'javascript';
      case 'json': return 'json';
      case 'md': return 'markdown';
      case 'yml':
      case 'yaml': return 'yaml';
      case 'toml': return 'toml';
      default: return 'plaintext';
    }
  }
}

// Export singleton instance
export const db = new DatabaseService(); 