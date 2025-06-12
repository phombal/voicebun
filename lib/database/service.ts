import { SupabaseClient } from '@supabase/supabase-js';
import { supabase, supabaseServiceRole } from './auth';
import { 
  Database, 
  Project, 
  ProjectData,
  ProjectDataConfig,
  CreateProjectRequest,
  ProjectFilters,
  PaginationParams,
  PhoneNumber
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

  // Server-side version that doesn't require auth session (for API routes)
  async createProjectDataServerSide(projectId: string, userId: string, data: ProjectDataConfig): Promise<ProjectData> {
    console.log('💾 Creating project data with server-side method:', { projectId, userId });
    
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
    
    if (error) {
      console.error('❌ Database insert error for project data:', error);
      throw error;
    }
    
    console.log('✅ Project data created successfully');
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

  // Service role version that bypasses RLS policies
  async getProjectDataWithServiceRole(projectId: string): Promise<ProjectData | null> {
    console.log('🔍 Getting project data for project with service role:', projectId);
    
    try {
      const { data, error } = await supabaseServiceRole
        .from('project_data')
        .select('*')
        .eq('project_id', projectId)
        .eq('is_active', true)
        .limit(1);
      
      if (error) {
        console.error('❌ Error getting project data with service role:', error);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
        throw error;
      }
      
      console.log('✅ Project data query result with service role:', data);
      console.log('✅ Number of results found:', data ? data.length : 0);
      
      return data && data.length > 0 ? data[0] : null;
    } catch (err) {
      console.error('❌ Exception in getProjectDataWithServiceRole:', err);
      throw err;
    }
  }

  // Service role version to get project info (for debugging)
  async getProjectWithServiceRole(projectId: string): Promise<Project | null> {
    console.log('🔍 Getting project with service role:', projectId);
    
    const { data, error } = await supabaseServiceRole
      .from('projects')
      .select('*')
      .eq('id', projectId);
    
    if (error) {
      console.error('❌ Error getting project with service role:', error);
      throw error;
    }
    
    console.log('✅ Project query result with service role:', data);
    return data && data.length > 0 ? data[0] : null;
  }

  // Debug method to check if any project_data exists
  async getAllProjectDataWithServiceRole(): Promise<any[]> {
    console.log('🔍 Getting all project data with service role for debugging');
    
    const { data, error } = await supabaseServiceRole
      .from('project_data')
      .select('project_id, id, is_active')
      .limit(10);
    
    if (error) {
      console.error('❌ Error getting all project data with service role:', error);
      return [];
    }
    
    console.log('✅ All project data (limited to 10):', data);
    return data || [];
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

  // Phone Number Management
  async createPhoneNumber(phoneNumberData: Omit<PhoneNumber, 'id' | 'created_at' | 'updated_at'>): Promise<PhoneNumber> {
    const userId = await this.getCurrentUserId();
    
    const { data, error } = await this.supabase
      .from('phone_numbers')
      .insert({
        ...phoneNumberData,
        user_id: userId,
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  // Server-side version that doesn't require auth session (for API routes)
  async createPhoneNumberServerSide(phoneNumberData: Omit<PhoneNumber, 'id' | 'created_at' | 'updated_at'>): Promise<PhoneNumber> {
    console.log('💾 Creating phone number with simplified data:', phoneNumberData);
    
    const { data, error } = await this.supabase
      .from('phone_numbers')
      .insert(phoneNumberData)
      .select()
      .single();
    
    if (error) {
      console.error('❌ Database insert error:', error);
      throw error;
    }
    
    console.log('✅ Phone number created successfully:', data);
    return data;
  }

  async getPhoneNumber(phoneNumberId: string): Promise<PhoneNumber | null> {
    const { data, error } = await this.supabase
      .from('phone_numbers')
      .select('*')
      .eq('id', phoneNumberId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async getPhoneNumberByNumber(phoneNumber: string): Promise<PhoneNumber | null> {
    const { data, error } = await this.supabase
      .from('phone_numbers')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async getUserPhoneNumbers(): Promise<PhoneNumber[]> {
    const userId = await this.getCurrentUserId();
    
    const { data, error } = await this.supabase
      .from('phone_numbers')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }

  async getProjectPhoneNumbers(projectId: string): Promise<PhoneNumber[]> {
    const { data, error } = await this.supabase
      .from('phone_numbers')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }

  async updatePhoneNumber(phoneNumberId: string, updates: Partial<Omit<PhoneNumber, 'id' | 'created_at'>>): Promise<PhoneNumber> {
    const { data, error } = await this.supabase
      .from('phone_numbers')
      .update(updates)
      .eq('id', phoneNumberId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updatePhoneNumberStatus(phoneNumberId: string, status: string): Promise<PhoneNumber> {
    return this.updatePhoneNumber(phoneNumberId, { status });
  }

  async activatePhoneNumber(phoneNumberId: string): Promise<PhoneNumber> {
    return this.updatePhoneNumber(phoneNumberId, { 
      status: 'active'
    });
  }

  async deactivatePhoneNumber(phoneNumberId: string): Promise<PhoneNumber> {
    return this.updatePhoneNumberStatus(phoneNumberId, 'inactive');
  }

  async updatePhoneNumberDispatchRule(phoneNumberId: string, dispatchRuleId: string): Promise<PhoneNumber> {
    const { data, error } = await this.supabase
      .from('phone_numbers')
      .update({ dispatch_rule_id: dispatchRuleId })
      .eq('id', phoneNumberId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  // Service role version for updating dispatch rule ID
  async updatePhoneNumberDispatchRuleWithServiceRole(phoneNumberId: string, dispatchRuleId: string): Promise<PhoneNumber> {
    const { data, error } = await supabaseServiceRole
      .from('phone_numbers')
      .update({ dispatch_rule_id: dispatchRuleId })
      .eq('id', phoneNumberId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
}

// Export singleton instance
export const db = new DatabaseService(); 