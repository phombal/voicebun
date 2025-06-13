import { z } from 'zod';

// Common validation patterns
export const phoneNumberRegex = /^\+?[1-9]\d{1,14}$/;
export const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Base schemas
export const UUIDSchema = z.string().regex(uuidRegex, 'Invalid UUID format');
export const PhoneNumberSchema = z.string().regex(phoneNumberRegex, 'Invalid phone number format');
export const EmailSchema = z.string().email('Invalid email format');

// User-related schemas
export const CreateUserSchema = z.object({
  email: EmailSchema,
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  avatar_url: z.string().url().optional(),
});

export const UpdateUserSchema = CreateUserSchema.partial();

// Project-related schemas
export const CreateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(100, 'Project name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  user_id: UUIDSchema,
});

export const UpdateProjectSchema = CreateProjectSchema.partial().omit({ user_id: true });

// Phone number schemas
export const PurchasePhoneNumberSchema = z.object({
  phoneNumber: PhoneNumberSchema,
  userId: UUIDSchema,
  projectId: UUIDSchema,
  connectionId: z.string().optional(),
  messagingProfileId: z.string().optional(),
  billingGroupId: z.string().optional(),
  customerReference: z.string().max(100).optional(),
});

export const AssignPhoneNumberSchema = z.object({
  phoneNumberId: UUIDSchema,
  projectId: UUIDSchema,
  userId: UUIDSchema,
});

// Voice agent configuration schemas
export const VoiceConfigSchema = z.object({
  voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']),
  speed: z.number().min(0.25).max(4.0),
  temperature: z.number().min(0).max(2),
  max_tokens: z.number().min(1).max(4096).optional(),
  model: z.string().min(1),
});

export const AgentConfigSchema = z.object({
  name: z.string().min(1, 'Agent name is required').max(100, 'Agent name too long'),
  system_prompt: z.string().min(1, 'System prompt is required').max(2000, 'System prompt too long'),
  voice_config: VoiceConfigSchema,
  project_id: UUIDSchema,
  user_id: UUIDSchema,
});

// File upload schemas
export const FileUploadSchema = z.object({
  filename: z.string().min(1, 'Filename is required').max(255, 'Filename too long'),
  content_type: z.string().min(1, 'Content type is required'),
  size: z.number().min(1, 'File size must be greater than 0').max(10 * 1024 * 1024, 'File too large (max 10MB)'),
  project_id: UUIDSchema,
  user_id: UUIDSchema,
});

// Conversation schemas
export const CreateConversationSchema = z.object({
  project_id: UUIDSchema,
  user_id: UUIDSchema,
  phone_number_id: UUIDSchema.optional(),
  caller_number: PhoneNumberSchema.optional(),
  duration: z.number().min(0).optional(),
  cost: z.number().min(0).optional(),
});

// Subscription schemas
export const CreateCheckoutSessionSchema = z.object({
  user_id: UUIDSchema,
  price_id: z.string().min(1, 'Price ID is required'),
  success_url: z.string().url('Invalid success URL'),
  cancel_url: z.string().url('Invalid cancel URL'),
});

// Pagination schemas
export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

// Search schemas
export const SearchSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(100, 'Search query too long'),
  filters: z.record(z.string()).optional(),
}).merge(PaginationSchema);

// Webhook schemas
export const StripeWebhookSchema = z.object({
  id: z.string(),
  object: z.literal('event'),
  type: z.string(),
  data: z.object({
    object: z.record(z.any()),
  }),
  created: z.number(),
  livemode: z.boolean(),
});

// Validation helper functions
export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((err: z.ZodIssue) => `${err.path.join('.')}: ${err.message}`);
      throw new Error(`Validation failed: ${errorMessages.join(', ')}`);
    }
    throw error;
  }
}

export function validateRequestSafe<T>(schema: z.ZodSchema<T>, data: unknown): {
  success: boolean;
  data?: T;
  error?: string;
} {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((err: z.ZodIssue) => `${err.path.join('.')}: ${err.message}`);
      return { success: false, error: `Validation failed: ${errorMessages.join(', ')}` };
    }
    return { success: false, error: 'Unknown validation error' };
  }
}

// Middleware for request validation
export function withValidation<T>(schema: z.ZodSchema<T>) {
  return (handler: (validatedData: T, request: Request) => Promise<Response>) => {
    return async (request: Request) => {
      try {
        const body = await request.json();
        const validatedData = schema.parse(body) as T;
        return handler(validatedData, request);
      } catch (error: any) {
        return new Response(
          JSON.stringify({
            error: 'Validation Error',
            message: error.message,
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    };
  };
} 