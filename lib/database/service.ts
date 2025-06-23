import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './auth';
import { supabaseServiceRole } from './server';
import { 
  Database, 
  Project, 
  ProjectData,
  ProjectDataConfig,
  CreateProjectRequest,
  ProjectFilters,
  PaginationParams,
  PhoneNumber,
  UserPlan
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
        config: request.config,
        visibility: request.visibility || 'private'
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

  // Hard delete project and all related data
  async hardDeleteProject(projectId: string): Promise<void> {
    const userId = await this.getCurrentUserId();
    
    // First verify the project belongs to the current user
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    if (project.user_id !== userId) {
      throw new Error('Unauthorized: You can only delete your own projects');
    }

    // Get all phone numbers assigned to this project and unassign them
    const projectPhoneNumbers = await this.getProjectPhoneNumbers(projectId);
    
    // Unassign all phone numbers from this project (database only)
    for (const phoneNumber of projectPhoneNumbers) {
      try {
        console.log(`📞 Unassigning phone number ${phoneNumber.phone_number} from project ${projectId}`);
        
        await this.updatePhoneNumber(phoneNumber.id, {
          status: 'active',
          project_id: null,
          voice_agent_enabled: false,
          updated_at: new Date().toISOString()
        });
        
        console.log(`✅ Successfully unassigned phone number ${phoneNumber.phone_number} from database`);
      } catch (error) {
        console.error(`⚠️ Error unassigning phone number ${phoneNumber.phone_number}:`, error);
        // Continue with other phone numbers even if one fails
      }
    }

    // Delete all project_data entries for this project
    const { error: projectDataError } = await this.supabase
      .from('project_data')
      .delete()
      .eq('project_id', projectId);
    
    if (projectDataError) throw projectDataError;

    // Delete the project itself
    const { error: projectError } = await this.supabase
      .from('projects')
      .delete()
      .eq('id', projectId);
    
    if (projectError) throw projectError;
  }

  // Server-side method for complete project deletion with LiveKit cleanup
  async hardDeleteProjectWithCleanup(projectId: string, userId: string): Promise<void> {
    // First verify the project belongs to the user
    const project = await supabaseServiceRole
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();
    
    if (!project.data) {
      throw new Error('Project not found or unauthorized');
    }

    // Get all phone numbers assigned to this project
    const { data: projectPhoneNumbers } = await supabaseServiceRole
      .from('phone_numbers')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_active', true);
    
    // Unassign all phone numbers and clean up LiveKit resources
    if (projectPhoneNumbers && projectPhoneNumbers.length > 0) {
      for (const phoneNumber of projectPhoneNumbers) {
        try {
          console.log(`📞 Unassigning and cleaning up phone number ${phoneNumber.phone_number}`);
          
          // Update database to unassign
          await supabaseServiceRole
            .from('phone_numbers')
            .update({
              status: 'active',
              project_id: null,
              voice_agent_enabled: false,
              updated_at: new Date().toISOString()
            })
            .eq('id', phoneNumber.id);

          // TODO: Add LiveKit cleanup logic here if needed
          // This would involve cleaning up dispatch rules and trunks
          // similar to the unassign-phone-number route
          
          console.log(`✅ Successfully unassigned phone number ${phoneNumber.phone_number}`);
        } catch (error) {
          console.error(`⚠️ Error unassigning phone number ${phoneNumber.phone_number}:`, error);
        }
      }
    }

    // Delete all project_data entries for this project
    const { error: projectDataError } = await supabaseServiceRole
      .from('project_data')
      .delete()
      .eq('project_id', projectId);
    
    if (projectDataError) throw projectDataError;

    // Delete the project itself
    const { error: projectError } = await supabaseServiceRole
      .from('projects')
      .delete()
      .eq('id', projectId);
    
    if (projectError) throw projectError;
  }

  // Project Data Management
  async createProjectData(projectId: string, data: ProjectDataConfig): Promise<ProjectData> {
    const userId = await this.getCurrentUserId();
    
    console.log('💾 Creating project data for project:', projectId);
    console.log('💾 User ID:', userId);
    console.log('💾 Input data keys:', Object.keys(data));
    
    const insertData = {
      project_id: projectId,
      user_id: userId,
      version: 1,
      is_active: true,
      ...data
    };
    
    console.log('💾 Final insert data keys:', Object.keys(insertData));
    console.log('💾 Final insert data project_emoji:', insertData.project_emoji);
    
    // Log the exact data being sent to Supabase
    console.log('💾 Complete insertData object:', JSON.stringify(insertData, null, 2));
    
    // Test: Try to manually verify the category field can be written/read
    console.log('🧪 Testing category field access...');
    try {
      const { data: testData, error: testError } = await this.supabase
        .from('project_data')
        .select('category, project_emoji')
        .limit(1);
      
      console.log('🧪 Test query result - can read category column:', testData);
      if (testError) {
        console.log('🧪 Test query error:', testError);
      }
    } catch (testErr) {
      console.log('🧪 Test query failed:', testErr);
    }
    
    // Create project data
    const { data: projectData, error: projectDataError } = await this.supabase
      .from('project_data')
      .insert(insertData)
      .select()
      .single();

    if (projectDataError) {
      console.error('❌ Error creating project data:', {
        error: projectDataError,
        code: projectDataError.code,
        message: projectDataError.message,
        details: projectDataError.details,
        hint: projectDataError.hint
      });
      throw new Error(`Failed to create project data: ${projectDataError.message}`);
    }

    console.log('✅ Project data created successfully:', {
      id: projectData.id,
      keys: Object.keys(projectData),
      projectEmoji: projectData.project_emoji,
      result: JSON.stringify(projectData, null, 2)
    });

    return projectData;
  }

  // Server-side version that doesn't require auth session (for API routes)
  async createProjectDataServerSide(projectId: string, userId: string, data: ProjectDataConfig): Promise<ProjectData> {
    console.log('💾 Creating project data with server-side method:', { projectId, userId });
    console.log('💾 Server-side input data keys:', Object.keys(data));
    console.log('💾 Server-side project emoji in data:', data.project_emoji);
    
    const insertData = {
      project_id: projectId,
      user_id: userId,
      version: 1,
      is_active: true,
      ...data
    };
    
    console.log('💾 Server-side final insert data keys:', Object.keys(insertData));
    console.log('💾 Server-side final insert data project_emoji:', insertData.project_emoji);
    
    const { data: result, error } = await this.supabase
      .from('project_data')
      .insert(insertData)
      .select()
      .single();
    
    if (error) {
      console.error('❌ Database insert error for project data:', error);
      throw error;
    }
    
    console.log('✅ Project data created successfully');
    console.log('✅ Server-side returned data keys:', Object.keys(result));
    console.log('✅ Server-side returned project_emoji:', result.project_emoji);
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

  // Get project data using service role (for server-side operations)
  async getProjectDataWithServiceRole(projectId: string) {
    console.log('🔍 Getting project data with service role for project:', projectId);
    
    const { data, error } = await supabaseServiceRole
      .from('project_data')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('❌ Error fetching project data with service role:', error);
      return null;
    }

    console.log('📋 Project data query result:', data ? 'Found' : 'Not found');
    
    if (!data) {
      // Debug: Check if any project data exists for this project (without is_active filter)
      console.log('🔍 No active project data found, checking if any project data exists...');
      const { data: allData, error: allError } = await supabaseServiceRole
        .from('project_data')
        .select('id, project_id, is_active, version, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      
      if (allError) {
        console.error('❌ Error checking all project data:', allError);
      } else {
        console.log('📊 All project data for this project:', allData);
        if (allData && allData.length > 0) {
          console.log(`⚠️ Found ${allData.length} project data record(s) but none are active`);
          console.log('🔍 Active status of records:', allData.map(d => ({ id: d.id, is_active: d.is_active, version: d.version })));
        } else {
          console.log('📭 No project data records found at all for this project');
        }
      }
    } else {
      console.log('✅ Successfully found active project data:', {
        id: data.id,
        version: data.version,
        hasSystemPrompt: !!data.system_prompt,
        llmProvider: data.llm_provider,
        llmModel: data.llm_model
      });
    }

    return data;
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
    
    const { data, error } = await supabaseServiceRole
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

  // Get unassigned phone numbers for the current user
  async getUnassignedPhoneNumbers(): Promise<PhoneNumber[]> {
    const { data, error } = await this.supabase
      .from('phone_numbers')
      .select('*')
      .is('project_id', null)
      .eq('is_active', true)
      .eq('status', 'active')
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

  // Assign a phone number to a project
  async assignPhoneNumberToProject(phoneNumberId: string, projectId: string): Promise<PhoneNumber> {
    // First verify the project belongs to the current user
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    
    const userId = await this.getCurrentUserId();
    if (project.user_id !== userId) {
      throw new Error('Unauthorized: Project does not belong to current user');
    }

    const { data, error } = await this.supabase
      .from('phone_numbers')
      .update({ 
        project_id: projectId,
        updated_at: new Date().toISOString()
      })
      .eq('id', phoneNumberId)
      .eq('user_id', userId) // Ensure user owns the phone number
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  // Unassign a phone number from its project
  async unassignPhoneNumberFromProject(phoneNumberId: string): Promise<PhoneNumber> {
    const { data, error } = await this.supabase
      .from('phone_numbers')
      .update({ 
        project_id: null,
        voice_agent_enabled: false,
        dispatch_rule_id: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', phoneNumberId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
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

  // User Plan Management
  async getUserPlan(): Promise<UserPlan | null> {
    try {
      const userId = await this.getCurrentUserId();
      
      // Get user plan from database
      const { data, error } = await this.supabase
        .from('user_plans')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No plan found, create default free plan
          return await this.createUserPlan(userId, {
            plan_name: 'free',
            subscription_status: 'inactive',
            conversation_minutes_used: 0,
            conversation_minutes_limit: 5,
            phone_number_count: 0,
            phone_number_limit: 1,
            cancel_at_period_end: false,
          });
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error getting user plan:', error);
      throw error;
    }
  }

  async createUserPlan(userId: string, planData: Partial<UserPlan>): Promise<UserPlan> {
    const { data, error } = await this.supabase
      .from('user_plans')
      .insert({
        user_id: userId,
        plan_name: 'free',
        subscription_status: 'active',
        conversation_minutes_used: 0,
        conversation_minutes_limit: 5,
        phone_number_count: 0,
        phone_number_limit: 1,
        cancel_at_period_end: false,
        ...planData
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateUserPlan(userId: string, updates: Partial<UserPlan>): Promise<UserPlan> {
    const { data, error } = await this.supabase
      .from('user_plans')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateConversationMinutes(userId: string, minutesUsed: number): Promise<UserPlan> {
    const { data, error } = await this.supabase
      .from('user_plans')
      .update({ 
        conversation_minutes_used: minutesUsed,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  // Phone number limit management
  async checkPhoneNumberLimit(): Promise<{ canPurchase: boolean; currentCount: number; limit: number }> {
    try {
      const userPlan = await this.getUserPlan();
      if (!userPlan) {
        throw new Error('User plan not found');
      }

      return {
        canPurchase: userPlan.phone_number_count < userPlan.phone_number_limit,
        currentCount: userPlan.phone_number_count,
        limit: userPlan.phone_number_limit
      };
    } catch (error) {
      console.error('Error checking phone number limit:', error);
      throw error;
    }
  }

  // Server-side version for API routes
  async checkPhoneNumberLimitWithServiceRole(userId: string): Promise<{ canPurchase: boolean; currentCount: number; limit: number }> {
    try {
      let userPlan = await this.getUserPlanWithServiceRole(userId);
      if (!userPlan) {
        // Create a default user plan if none exists
        userPlan = await this.createUserPlanWithServiceRole(userId, {});
      }

      return {
        canPurchase: userPlan.phone_number_count < userPlan.phone_number_limit,
        currentCount: userPlan.phone_number_count,
        limit: userPlan.phone_number_limit
      };
    } catch (error) {
      console.error('Error checking phone number limit with service role:', error);
      throw error;
    }
  }

  async incrementPhoneNumberCount(userId: string): Promise<UserPlan> {
    const { error } = await this.supabase
      .rpc('increment_phone_number_count', { input_user_id: userId });
    
    if (error) throw error;
    
    // Return updated user plan
    const userPlan = await this.getUserPlan();
    if (!userPlan) {
      throw new Error('User plan not found after incrementing phone number count');
    }
    return userPlan;
  }

  // Server-side version for API routes
  async incrementPhoneNumberCountWithServiceRole(userId: string): Promise<UserPlan> {
    try {
      const { error } = await supabaseServiceRole
        .rpc('increment_phone_number_count', { input_user_id: userId });
      
      if (error) {
        // If the function doesn't exist, handle it gracefully
        if (error.code === 'PGRST202' && error.message.includes('Could not find the function')) {
          console.warn('⚠️ increment_phone_number_count function not found, falling back to manual update');
          
          // Fallback: manually update or create user plan
          const existingPlan = await this.getUserPlanWithServiceRole(userId);
          if (existingPlan) {
            return await this.updateUserPlanWithServiceRole(userId, {
              phone_number_count: Math.min((existingPlan.phone_number_count || 0) + 1, existingPlan.phone_number_limit || 1),
              updated_at: new Date().toISOString()
            });
          } else {
            return await this.createUserPlanWithServiceRole(userId, {
              phone_number_count: 1,
              phone_number_limit: 1,
              plan_name: 'free',
              subscription_status: 'active',
              conversation_minutes_used: 0,
              conversation_minutes_limit: 5,
              cancel_at_period_end: false
            });
          }
        }
        throw error;
      }
      
      // Return updated user plan
      const userPlan = await this.getUserPlanWithServiceRole(userId);
      if (!userPlan) {
        throw new Error('User plan not found after incrementing phone number count');
      }
      return userPlan;
    } catch (error) {
      console.error('Error in incrementPhoneNumberCountWithServiceRole:', error);
      throw error;
    }
  }

  async decrementPhoneNumberCount(userId: string): Promise<UserPlan> {
    const { error } = await this.supabase
      .rpc('decrement_phone_number_count', { input_user_id: userId });
    
    if (error) throw error;
    
    // Return updated user plan
    const userPlan = await this.getUserPlan();
    if (!userPlan) {
      throw new Error('User plan not found after decrementing phone number count');
    }
    return userPlan;
  }

  async updatePhoneNumberLimitForPlan(userId: string, planName: 'free' | 'professional' | 'enterprise'): Promise<UserPlan> {
    const phoneNumberLimit = planName === 'professional' ? 5 : planName === 'enterprise' ? 999 : 1;
    
    const { data, error } = await this.supabase
      .from('user_plans')
      .update({ 
        phone_number_limit: phoneNumberLimit,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  // Server-side methods for user plans (for API routes)
  async getUserPlanWithServiceRole(userId: string): Promise<UserPlan | null> {
    const { data, error } = await supabaseServiceRole
      .from('user_plans')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async createUserPlanWithServiceRole(userId: string, planData: Partial<UserPlan>): Promise<UserPlan> {
    const { data, error } = await supabaseServiceRole
      .from('user_plans')
      .insert({
        user_id: userId,
        plan_name: 'free',
        subscription_status: 'active',
        conversation_minutes_used: 0,
        conversation_minutes_limit: 5,
        phone_number_count: 0,
        phone_number_limit: 1,
        cancel_at_period_end: false,
        ...planData
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateUserPlanWithServiceRole(userId: string, updates: Partial<UserPlan>): Promise<UserPlan> {
    const { data, error } = await supabaseServiceRole
      .from('user_plans')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
}

// Export singleton instance
export const db = new DatabaseService(); 