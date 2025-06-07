# Voice Assistant Database Setup

This directory contains the complete database schema and setup for the Voice Assistant application using Supabase.

## Overview

The database is designed to track:
- **User profiles** and preferences
- **Projects** (voice agent configurations)
- **Chat sessions** and messages with conversation context
- **Project files** with version history and snapshots
- **Code changes** with detailed diff tracking
- **Automatic saving** and checkpoint system

## Files

- `schema.sql` - Complete database schema with tables, indexes, and RLS policies
- `views.sql` - Database views for aggregated data and analytics
- `types.ts` - TypeScript type definitions matching the database schema
- `service.ts` - Database service class with all CRUD operations

## Setup Instructions

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and anon key from the project settings

### 2. Environment Variables

Add these to your `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Run Database Schema

1. Open the Supabase SQL Editor in your project dashboard
2. Copy and paste the contents of `schema.sql`
3. Execute the SQL to create all tables, indexes, and policies
4. Copy and paste the contents of `views.sql`
5. Execute the SQL to create all views

### 4. Enable Row Level Security

The schema includes RLS policies that:
- Users can only access their own data
- Projects are isolated by user
- Chat sessions and messages are scoped to project owners
- File access is controlled through project ownership

### 5. Install Dependencies

```bash
npm install @supabase/supabase-js
```

## Database Schema

### Core Tables

#### `user_profiles`
Extends Supabase auth.users with additional profile information.

#### `projects`
Voice agent projects with configuration and metadata.

#### `chat_sessions`
Individual chat conversations within projects.

#### `chat_messages`
Messages within chat sessions, with checkpoint tracking.

#### `project_files`
Files within projects with version tracking.

#### `file_snapshots`
Version history for files with diff tracking.

#### `project_snapshots`
Complete project state snapshots.

#### `code_changes`
Detailed tracking of all code modifications.

### Views

#### `project_overview`
Aggregated project statistics including session, message, and file counts.

#### `recent_chat_activity`
Recent chat activity across all user projects.

#### `file_change_history`
Complete file change history with context.

## Usage

### Basic Usage

```typescript
import { db } from '@/lib/database/service';

// Create a new project
const project = await db.createProject({
  name: 'My Voice Agent',
  description: 'A helpful voice assistant',
  initial_prompt: 'You are a helpful assistant...',
  config: { voice: 'alloy', model: 'gpt-4' }
});

// Start a chat session
const session = await db.createChatSession({
  project_id: project.id,
  title: 'Initial Setup'
});

// Add messages
const userMessage = await db.createChatMessage({
  session_id: session.id,
  role: 'user',
  content: 'Create a simple voice agent'
});

const assistantMessage = await db.createChatMessage({
  session_id: session.id,
  role: 'assistant',
  content: 'I\'ll create a voice agent for you...',
  is_checkpoint: true // Mark as checkpoint for code changes
});
```

### File Management

```typescript
// Create a file
const file = await db.createProjectFile(project.id, {
  file_path: 'main.py',
  file_name: 'main.py',
  file_type: 'file',
  content: 'print("Hello, World!")',
  language: 'python'
});

// Update file (automatically creates snapshot)
const updatedFile = await db.updateProjectFile(
  project.id,
  {
    file_path: 'main.py',
    content: 'print("Hello, Voice Assistant!")',
    change_description: 'Updated greeting message'
  },
  session.id,
  assistantMessage.id
);

// Get file history
const snapshots = await db.getFileSnapshots(file.id);

// Revert to previous version
await db.revertFileToSnapshot(file.id, snapshots[1].id);
```

### Batch Operations

```typescript
// Sync virtual file system to database
await db.syncVirtualFileSystemToDatabase(
  project.id,
  session.id,
  assistantMessage.id,
  [
    { path: 'main.py', name: 'main.py', content: '...', type: 'file' },
    { path: 'utils.py', name: 'utils.py', content: '...', type: 'file' }
  ],
  'Updated voice agent implementation'
);
```

### Project Snapshots

```typescript
// Create project snapshot
const snapshot = await db.createProjectSnapshot(
  project.id,
  session.id,
  assistantMessage.id,
  'Working Voice Agent v1.0',
  'First working version with basic functionality'
);

// Restore project to snapshot
await db.restoreProjectSnapshot(snapshot.id);
```

### Analytics

```typescript
// Get project statistics
const stats = await db.getProjectStats(project.id);

// Get recent activity
const activity = await db.getRecentActivity(10);

// Get user projects with filtering
const projects = await db.getUserProjects(
  { status: 'active', search: 'voice' },
  { page: 1, limit: 20, sort_by: 'updated_at', sort_order: 'desc' }
);
```

## Features

### Automatic Saving
- Every file change creates a snapshot
- Diffs are automatically generated
- No data loss with complete version history

### Checkpoint System
- Messages can be marked as checkpoints
- Project snapshots linked to specific messages
- One-click rollback to any checkpoint

### Conversation Context
- Full conversation history preserved
- Context tracking for code changes
- Relationship between messages and file modifications

### Performance Optimizations
- Efficient pagination for large datasets
- Indexed queries for fast lookups
- Views for complex aggregations
- RLS policies for security

### Future Features
- Team collaboration support
- Advanced analytics and insights
- Export/import functionality
- Integration with external tools

## Security

- Row Level Security (RLS) enabled on all tables
- Users can only access their own data
- API keys should be kept secure
- Consider additional authentication for production

## Monitoring

Monitor your database usage in the Supabase dashboard:
- Query performance
- Storage usage
- API usage
- Real-time subscriptions

## Backup

Supabase provides automatic backups, but consider:
- Regular exports for critical data
- Point-in-time recovery setup
- Disaster recovery planning 