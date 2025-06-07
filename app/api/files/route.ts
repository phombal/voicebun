import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Base directory for user projects (in a real app, this would be user-specific)
const BASE_DIR = path.join(process.cwd(), 'user-projects');

// Ensure base directory exists
async function ensureBaseDir() {
  try {
    await fs.access(BASE_DIR);
  } catch {
    await fs.mkdir(BASE_DIR, { recursive: true });
  }
}

// Helper function to validate and resolve paths
function resolvePath(relativePath: string): string {
  const resolved = path.resolve(BASE_DIR, relativePath.replace(/^\//, ''));
  
  // Security check: ensure the path is within BASE_DIR
  if (!resolved.startsWith(BASE_DIR)) {
    throw new Error('Invalid path: outside of allowed directory');
  }
  
  return resolved;
}

// GET - List files and folders
export async function GET(request: NextRequest) {
  try {
    await ensureBaseDir();
    
    const { searchParams } = new URL(request.url);
    const dirPath = searchParams.get('path') || '/';
    
    const fullPath = resolvePath(dirPath);
    
    try {
      const items = await fs.readdir(fullPath, { withFileTypes: true });
      
      const fileList = await Promise.all(
        items.map(async (item) => {
          const itemPath = path.join(fullPath, item.name);
          const stats = await fs.stat(itemPath);
          const relativePath = path.relative(BASE_DIR, itemPath).replace(/\\/g, '/');
          
          return {
            name: item.name,
            type: item.isDirectory() ? 'folder' : 'file',
            path: '/' + relativePath,
            size: item.isFile() ? stats.size : undefined,
            modified: stats.mtime.toISOString(),
          };
        })
      );
      
      return NextResponse.json({ files: fileList });
    } catch (error) {
      return NextResponse.json({ error: 'Directory not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('Error listing files:', error);
    return NextResponse.json({ error: 'Failed to list files' }, { status: 500 });
  }
}

// POST - Create file or folder
export async function POST(request: NextRequest) {
  try {
    await ensureBaseDir();
    
    const body = await request.json();
    const { path: filePath, type, content = '' } = body;
    
    if (!filePath || !type) {
      return NextResponse.json({ error: 'Path and type are required' }, { status: 400 });
    }
    
    const fullPath = resolvePath(filePath);
    
    try {
      // Check if file/folder already exists
      await fs.access(fullPath);
      return NextResponse.json({ error: 'File or folder already exists' }, { status: 409 });
    } catch {
      // File doesn't exist, which is what we want
    }
    
    // Ensure parent directory exists
    const parentDir = path.dirname(fullPath);
    await fs.mkdir(parentDir, { recursive: true });
    
    if (type === 'folder') {
      await fs.mkdir(fullPath, { recursive: true });
    } else {
      await fs.writeFile(fullPath, content, 'utf8');
    }
    
    return NextResponse.json({ 
      message: `${type === 'folder' ? 'Folder' : 'File'} created successfully`,
      path: filePath 
    });
  } catch (error) {
    console.error('Error creating file/folder:', error);
    return NextResponse.json({ error: 'Failed to create file/folder' }, { status: 500 });
  }
}

// PUT - Update file content
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { path: filePath, content } = body;
    
    if (!filePath || content === undefined) {
      return NextResponse.json({ error: 'Path and content are required' }, { status: 400 });
    }
    
    const fullPath = resolvePath(filePath);
    
    // Check if file exists
    try {
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) {
        return NextResponse.json({ error: 'Cannot update directory content' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    
    await fs.writeFile(fullPath, content, 'utf8');
    
    return NextResponse.json({ message: 'File updated successfully' });
  } catch (error) {
    console.error('Error updating file:', error);
    return NextResponse.json({ error: 'Failed to update file' }, { status: 500 });
  }
}

// DELETE - Delete file or folder
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');
    
    if (!filePath) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }
    
    const fullPath = resolvePath(filePath);
    
    try {
      const stats = await fs.stat(fullPath);
      
      if (stats.isDirectory()) {
        await fs.rmdir(fullPath, { recursive: true });
      } else {
        await fs.unlink(fullPath);
      }
      
      return NextResponse.json({ message: 'Deleted successfully' });
    } catch {
      return NextResponse.json({ error: 'File or folder not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('Error deleting file/folder:', error);
    return NextResponse.json({ error: 'Failed to delete file/folder' }, { status: 500 });
  }
} 