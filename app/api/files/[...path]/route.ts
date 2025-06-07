import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const BASE_DIR = path.join(process.cwd(), 'user-projects');

function resolvePath(relativePath: string): string {
  const resolved = path.resolve(BASE_DIR, relativePath.replace(/^\//, ''));
  
  if (!resolved.startsWith(BASE_DIR)) {
    throw new Error('Invalid path: outside of allowed directory');
  }
  
  return resolved;
}

// GET - Read file content
export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const filePath = '/' + params.path.join('/');
    const fullPath = resolvePath(filePath);
    
    try {
      const stats = await fs.stat(fullPath);
      
      if (stats.isDirectory()) {
        return NextResponse.json({ error: 'Cannot read directory as file' }, { status: 400 });
      }
      
      const content = await fs.readFile(fullPath, 'utf8');
      
      return NextResponse.json({ 
        content,
        path: filePath,
        size: stats.size,
        modified: stats.mtime.toISOString()
      });
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('Error reading file:', error);
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
} 