import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './auth';
import { 
  Database, 
  Project, 
  ProjectData,
  ProjectDataConfig,
  CreateProjectRequest,
  ProjectFilters,
  PaginationParams
} from './types';

export class DatabaseService {
  private supabase: SupabaseClient<Database>;

  constructor() {
    this.supabase = supabase;
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
  ): Promise<Project[]> {
    const userId = await this.getCurrentUserId();

    let query = this.supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .neq('status', 'deleted');

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

    // Apply sorting
    const { sort_by = 'updated_at', sort_order = 'desc' } = pagination;
    query = query.order(sort_by, { ascending: sort_order === 'asc' });

    const { data, error } = await query;
    
    if (error) throw error;
    return data || [];
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

  // Project Data Management
  async createProjectData(projectId: string, data: ProjectDataConfig): Promise<ProjectData> {
    const userId = await this.getCurrentUserId();
    
    const { data: result, error } = await this.supabase
      .from('project_data')
      .insert({
        project_id: projectId,
        user_id: userId,
        version: 1,
        is_active: true,
        ...data
      })
      .select()
      .single();
    
    if (error) throw error;
    return result;
  }

  async getProjectData(projectId: string): Promise<ProjectData | null> {
    console.log('🔍 Getting project data for project:', projectId);
    
    const { data, error } = await this.supabase
      .from('project_data')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_active', true)
      .limit(1);
    
    if (error) {
      console.error('❌ Error getting project data:', error);
      throw error;
    }
    
    console.log('✅ Project data query result:', data);
    return data && data.length > 0 ? data[0] : null;
  }

  async updateProjectData(projectId: string, updates: Partial<ProjectDataConfig>): Promise<ProjectData> {
    const userId = await this.getCurrentUserId();
    
    // First, deactivate the current active version
    await this.supabase
      .from('project_data')
      .update({ is_active: false })
      .eq('project_id', projectId)
      .eq('is_active', true);

    // Get the current version number
    const { data: currentData } = await this.supabase
      .from('project_data')
      .select('version')
      .eq('project_id', projectId)
      .order('version', { ascending: false })
      .limit(1);

    const nextVersion = (currentData && currentData.length > 0 ? currentData[0].version : 0) + 1;

    // Create new version with updates
    const { data, error } = await this.supabase
      .from('project_data')
      .insert({
        project_id: projectId,
        user_id: userId,
        version: nextVersion,
        is_active: true,
        ...updates
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async getProjectDataHistory(projectId: string): Promise<ProjectData[]> {
    const { data, error } = await this.supabase
      .from('project_data')
      .select('*')
      .eq('project_id', projectId)
      .order('version', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }
}

// Export singleton instance
export const db = new DatabaseService(); 