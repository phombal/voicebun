import { useState, useEffect, useRef } from 'react';
import { type VoiceAgentConfig } from './VoiceAgentConfig';
import {
  BarVisualizer,
  DisconnectButton,
  RoomAudioRenderer,
  RoomContext,
  VideoTrack,
  VoiceAssistantControlBar,
  useVoiceAssistant,
} from "@livekit/components-react";
import TranscriptionView from "./TranscriptionView";
import { CloseIcon } from "./CloseIcon";
import { NoAgentNotification } from "./NoAgentNotification";
import { AnimatePresence, motion } from "framer-motion";
import { Room, RoomEvent } from "livekit-client";
import Editor from '@monaco-editor/react';
import { useDatabase } from '@/hooks/useDatabase';
import { ChatSession } from '@/lib/database/types';

interface GeneratedCodeDisplayProps {
  code: string;
  config: VoiceAgentConfig;
  onStartConversation?: () => void;
  onReconfigure: () => void;
  onBackToHome: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  checkpoint?: boolean; // Mark messages that created file changes
  filesSnapshot?: Map<string, string>; // Snapshot of all files at this point
}

// Virtual Filesystem Types
interface VirtualFile {
  id: string;
  name: string;
  type: 'file';
  content: string;
  path: string;
  modified: Date;
  version: number;
  snapshots: FileSnapshot[];
}

interface FileSnapshot {
  id: string;
  content: string;
  timestamp: Date;
  version: number;
  changeDescription?: string;
  diff?: string;
}

interface VirtualFolder {
  id: string;
  name: string;
  type: 'folder';
  path: string;
  children: (VirtualFile | VirtualFolder)[];
  expanded: boolean;
}

type VirtualFileSystemItem = VirtualFile | VirtualFolder;

// Virtual Filesystem Class
class VirtualFileSystem {
  private root: VirtualFolder;
  private fileMap: Map<string, VirtualFile>;

  constructor() {
    this.root = {
      id: 'root',
      name: 'root',
      type: 'folder',
      path: '/',
      children: [],
      expanded: true
    };
    this.fileMap = new Map();
  }

  // Create initial project structure
  initializeProject(code: string, config: VoiceAgentConfig) {
    this.root.children = [];
    this.fileMap.clear();

    const files = [
      {
        name: 'voice_agent.py',
        content: code,
        path: '/voice_agent.py'
      },
      {
        name: 'requirements.txt',
        content: `livekit-agents
livekit-plugins-openai
livekit-plugins-deepgram
livekit-plugins-cartesia
livekit-plugins-silero
python-dotenv
asyncio`,
        path: '/requirements.txt'
      },
      {
        name: '.env.example',
        content: `# Copy this file to .env and fill in your API keys
OPENAI_API_KEY=your_openai_api_key
DEEPGRAM_API_KEY=your_deepgram_api_key
CARTESIA_API_KEY=your_cartesia_api_key
LIVEKIT_URL=wss://your-livekit-server.com
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret`,
        path: '/.env.example'
      },
      {
        name: 'README.md',
        content: `# Voice Agent

This is your AI-powered voice agent built with LiveKit.

## Setup

1. Copy \`.env.example\` to \`.env\` and fill in your API keys
2. Install dependencies: \`pip install -r requirements.txt\`
3. Run the agent: \`python voice_agent.py\`

## Configuration

Your agent is configured with the following prompt:
"${config.prompt}"

## Features

- Real-time voice interaction
- Speech-to-text with Deepgram
- Text-to-speech with Cartesia
- AI responses powered by OpenAI
- Voice activity detection
- Noise cancellation`,
        path: '/README.md'
      }
    ];

    // Create config folder and files
    const configFolder = this.createFolder('config', '/config');
    this.root.children.push(configFolder);

    const configFiles = [
      {
        name: 'settings.py',
        content: `# Agent configuration settings
AGENT_PERSONALITY = "${config.personality}"
AGENT_LANGUAGE = "${config.language}"
RESPONSE_STYLE = "${config.responseStyle}"
CAPABILITIES = ${JSON.stringify(config.capabilities, null, 2)}

# Model configurations
STT_MODEL = "nova-3"
LLM_MODEL = "gpt-4o-mini"
TTS_MODEL = "cartesia"

# Voice settings
VOICE_ACTIVITY_DETECTION = True
NOISE_CANCELLATION = True
TURN_DETECTION = "multilingual"`,
        path: '/config/settings.py'
      }
    ];

    // Create utils folder and files
    const utilsFolder = this.createFolder('utils', '/utils');
    this.root.children.push(utilsFolder);

    const utilsFiles = [
      {
        name: 'logger.py',
        content: `import logging
import sys
from datetime import datetime

def setup_logger(name: str = "voice_agent", level: int = logging.INFO) -> logging.Logger:
    """Set up a logger with consistent formatting."""
    
    logger = logging.getLogger(name)
    logger.setLevel(level)
    
    # Remove existing handlers
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
    
    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    return logger`,
        path: '/utils/logger.py'
      },
      {
        name: 'helpers.py',
        content: `def format_agent_response(text: str) -> str:
    """Format agent response text for better readability."""
    # Remove extra whitespace
    text = ' '.join(text.split())
    
    # Ensure proper sentence endings
    if text and not text.endswith(('.', '!', '?')):
        text += '.'
    
    return text

def validate_config(config: dict) -> bool:
    """Validate agent configuration."""
    required_fields = ['prompt', 'personality', 'language']
    
    for field in required_fields:
        if field not in config or not config[field]:
            return False
    
    return True`,
        path: '/utils/helpers.py'
      }
    ];

    // Add all files
    files.forEach(file => {
      const vFile = this.createFile(file.name, file.content, file.path);
      this.root.children.push(vFile);
    });

    configFiles.forEach(file => {
      const vFile = this.createFile(file.name, file.content, file.path);
      configFolder.children.push(vFile);
    });

    utilsFiles.forEach(file => {
      const vFile = this.createFile(file.name, file.content, file.path);
      utilsFolder.children.push(vFile);
    });
  }

  private createFile(name: string, content: string, path: string): VirtualFile {
    const file: VirtualFile = {
      id: `file-${Date.now()}-${Math.random()}`,
      name,
      type: 'file',
      content,
      path,
      modified: new Date(),
      version: 1,
      snapshots: []
    };
    this.fileMap.set(path, file);
    return file;
  }

  private createFolder(name: string, path: string): VirtualFolder {
    return {
      id: `folder-${Date.now()}-${Math.random()}`,
      name,
      type: 'folder',
      path,
      children: [],
      expanded: true
    };
  }

  getFile(path: string): VirtualFile | null {
    return this.fileMap.get(path) || null;
  }

  updateFile(path: string, content: string, changeDescription?: string): boolean {
    const file = this.fileMap.get(path);
    if (file) {
      // Create snapshot before updating
      this.createSnapshot(file, changeDescription);
      
      // Generate diff
      const diff = this.generateDiff(file.content, content);
      
      // Update file content
      const oldContent = file.content;
      file.content = content;
      file.modified = new Date();
      file.version += 1;
      
      // Add snapshot with diff
      const snapshot: FileSnapshot = {
        id: `snapshot-${Date.now()}-${Math.random()}`,
        content: oldContent,
        timestamp: new Date(),
        version: file.version - 1,
        changeDescription,
        diff
      };
      
      file.snapshots.push(snapshot);
      
      // Keep only last 10 snapshots to avoid memory issues
      if (file.snapshots.length > 10) {
        file.snapshots = file.snapshots.slice(-10);
      }
      
      // Auto-save notification
      this.notifyAutoSave(file.name, changeDescription);
      
      return true;
    }
    return false;
  }

  private createSnapshot(file: VirtualFile, changeDescription?: string): void {
    const snapshot: FileSnapshot = {
      id: `snapshot-${Date.now()}-${Math.random()}`,
      content: file.content,
      timestamp: new Date(),
      version: file.version,
      changeDescription: changeDescription || 'Manual save'
    };
    
    file.snapshots.push(snapshot);
  }

  private generateDiff(oldContent: string, newContent: string): string {
    // Simple diff generation - in a real implementation you'd use a library like diff-match-patch
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

  private notifyAutoSave(fileName: string, changeDescription?: string): void {
    // Create auto-save notification
    const notification = document.createElement('div');
    notification.textContent = `✅ Auto-saved ${fileName}${changeDescription ? ` (${changeDescription})` : ''}`;
    notification.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-3 py-2 rounded-lg shadow-lg z-50 text-sm';
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (document.body.contains(notification)) {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s';
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
        }, 300);
      }
    }, 2000);
  }

  getFileHistory(path: string): FileSnapshot[] {
    const file = this.fileMap.get(path);
    return file ? file.snapshots : [];
  }

  revertToSnapshot(path: string, snapshotId: string): boolean {
    const file = this.fileMap.get(path);
    if (!file) return false;
    
    const snapshot = file.snapshots.find(s => s.id === snapshotId);
    if (!snapshot) return false;
    
    // Create a snapshot of current state before reverting
    this.createSnapshot(file, `Revert to version ${snapshot.version}`);
    
    // Revert to snapshot content
    file.content = snapshot.content;
    file.modified = new Date();
    file.version += 1;
    
    this.notifyAutoSave(file.name, `Reverted to version ${snapshot.version}`);
    
    return true;
  }

  createNewFile(parentPath: string, name: string, content: string = ''): VirtualFile | null {
    const fullPath = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
    
    // Normalize the path and check if file already exists with any path format
    const normalizedName = name.startsWith('/') ? name.substring(1) : name;
    const existingFile = this.getAllFiles().find(f => 
      f.name === normalizedName || 
      f.name === name ||
      f.path === fullPath ||
      f.path === `/${normalizedName}`
    );
    
    if (existingFile) {
      return null; // File already exists
    }

    const file = this.createFile(normalizedName, content, fullPath);
    
    // Find parent folder and add file
    const parent = this.findFolder(parentPath);
    if (parent) {
      parent.children.push(file);
      return file;
    }
    
    return null;
  }

  createNewFolder(parentPath: string, name: string): VirtualFolder | null {
    const fullPath = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
    
    const folder = this.createFolder(name, fullPath);
    
    // Find parent folder and add new folder
    const parent = this.findFolder(parentPath);
    if (parent) {
      parent.children.push(folder);
      return folder;
    }
    
    return null;
  }

  deleteItem(path: string): boolean {
    // Remove from file map if it's a file
    this.fileMap.delete(path);
    
    // Find parent and remove item
    const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
    const parent = this.findFolder(parentPath);
    
    if (parent) {
      parent.children = parent.children.filter(child => child.path !== path);
      return true;
    }
    
    return false;
  }

  findFolder(path: string): VirtualFolder | null {
    if (path === '/') return this.root;
    
    const parts = path.split('/').filter(Boolean);
    let current: VirtualFolder = this.root;
    
    for (const part of parts) {
      const child = current.children.find(c => c.name === part && c.type === 'folder') as VirtualFolder;
      if (!child) return null;
      current = child;
    }
    
    return current;
  }

  toggleFolder(path: string): void {
    const folder = this.findFolder(path);
    if (folder) {
      folder.expanded = !folder.expanded;
    }
  }

  getRoot(): VirtualFolder {
    return this.root;
  }

  getAllFiles(): VirtualFile[] {
    return Array.from(this.fileMap.values());
  }
}

export function GeneratedCodeDisplay({ code, config, onReconfigure, onBackToHome }: GeneratedCodeDisplayProps) {
  const [currentCode, setCurrentCode] = useState(code);
  const [selectedFile, setSelectedFile] = useState('voice_agent.py');
  const [fileSystemVersion, setFileSystemVersion] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [conversationContext, setConversationContext] = useState(`Voice Agent Project: "${config.prompt}"`);
  const [availableCheckpoints, setAvailableCheckpoints] = useState<ChatMessage[]>([]);
  const [showCheckpointModal, setShowCheckpointModal] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showTelephonyModal, setShowTelephonyModal] = useState(false);
  const [availableNumbers, setAvailableNumbers] = useState<any[]>([]);
  const [selectedNumber, setSelectedNumber] = useState<any>(null);
  const [isLoadingNumbers, setIsLoadingNumbers] = useState(false);
  const [isAssigningNumber, setIsAssigningNumber] = useState(false);
  const [assignedPhoneNumber, setAssignedPhoneNumber] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState<'file' | 'folder'>('file');
  const [createName, setCreateName] = useState('');
  const [createParentPath, setCreateParentPath] = useState('/');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string>('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyFile, setHistoryFile] = useState<VirtualFile | null>(null);
  const [showRevertModal, setShowRevertModal] = useState(false);
  const [revertSnapshot, setRevertSnapshot] = useState<FileSnapshot | null>(null);
  const [room] = useState(new Room());
  const [isInConversation, setIsInConversation] = useState(false);
  const [activeTab, setActiveTab] = useState<'test' | 'code'>('test');
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(true);
  const [editorValue, setEditorValue] = useState('');

  // Context menu state
  const [contextMenuPath, setContextMenuPath] = useState<string | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);

  // New file modal state
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileType, setNewFileType] = useState<'file' | 'folder'>('file');
  const [newFileParentPath, setNewFileParentPath] = useState('/');

  // Database integration state
  const [codeEditSession, setCodeEditSession] = useState<ChatSession | null>(null);
  const { 
    currentProject, 
    currentSession, 
    addChatMessage, 
    updateProjectFiles, 
    startChatSession,
    setCurrentProject,
    setCurrentSession
  } = useDatabase();
  
  // Ref for debouncing file saves
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize VFS
  const [vfs] = useState(() => {
    const virtualFileSystem = new VirtualFileSystem();
    virtualFileSystem.initializeProject(code, config);
    return virtualFileSystem;
  });

  // Initialize database session for code editing
  useEffect(() => {
    const initCodeEditSession = async () => {
      if (currentProject && !codeEditSession) {
        try {
          const session = await startChatSession(currentProject.id);
          setCodeEditSession(session);
          console.log('📝 Started code editing session:', session.id);
        } catch (error) {
          console.error('❌ Failed to start code editing session:', error);
        }
      }
    };

    initCodeEditSession();
  }, [currentProject, codeEditSession, startChatSession]);

  // Save chat messages to database
  const saveChatMessageToDatabase = async (message: ChatMessage) => {
    if (codeEditSession && addChatMessage) {
      try {
        await addChatMessage(
          codeEditSession.id,
          message.role,
          message.content,
          message.checkpoint || false
        );
        console.log('💾 Saved chat message to database:', message.role);
      } catch (error) {
        console.error('❌ Failed to save chat message to database:', error);
      }
    }
  };

  // Save file changes to database
  const saveFileChangesToDatabase = async (changeDescription?: string) => {
    if (currentProject && codeEditSession && updateProjectFiles) {
      try {
        const allFiles = vfs.getAllFiles();
        const filesData = allFiles.map((file: VirtualFile) => ({
          path: file.path,
          name: file.name,
          content: file.content,
          type: 'file' as const
        }));

        await updateProjectFiles(
          currentProject.id,
          codeEditSession.id,
          `msg_${Date.now()}`,
          filesData,
          changeDescription
        );
        
        console.log('💾 Saved file changes to database:', filesData.length, 'files');
      } catch (error) {
        console.error('❌ Failed to save file changes to database:', error);
      }
    }
  };

  // Debug logging for conversation state
  useEffect(() => {
    console.log('🔄 Conversation state changed:', isInConversation);
  }, [isInConversation]);

  // Auto-open file menu when switching to code tab
  useEffect(() => {
    if (activeTab === 'code' && !isFileMenuOpen) {
      setIsFileMenuOpen(true);
    }
  }, [activeTab]);

  // Initialize virtual filesystem and chat
  useEffect(() => {
    vfs.initializeProject(code, config);
    setFileSystemVersion(prev => prev + 1);
    
    // Load initial file content
    const initialFile = vfs.getFile('/voice_agent.py');
    if (initialFile) {
      setEditorValue(initialFile.content);
      setCurrentCode(initialFile.content);
    }
    
    // Initialize chat with welcome message and create initial checkpoint
    const welcomeMessage: ChatMessage = {
      id: '1',
      role: 'assistant',
      content: `I've generated your voice agent code based on your description: "${config.prompt}". You can ask me to modify the code, add features, fix issues, or explain how it works. What would you like me to help you with?`,
      timestamp: new Date(),
      checkpoint: true,
      filesSnapshot: createFilesSnapshot()
    };
    
    setMessages([welcomeMessage]);
    setAvailableCheckpoints([welcomeMessage]);
    
    // Initialize conversation context
    setConversationContext(`Voice Agent Project: "${config.prompt}"\nInitial setup completed with basic voice agent structure.`);
  }, []);

  // Create a snapshot of all current files
  const createFilesSnapshot = (): Map<string, string> => {
    const snapshot = new Map<string, string>();
    vfs.getAllFiles().forEach((file: VirtualFile) => {
      snapshot.set(file.path, file.content);
    });
    return snapshot;
  };

  // Restore files from a checkpoint snapshot
  const restoreFromCheckpoint = (snapshot: Map<string, string>) => {
    // Clear current VFS and rebuild from snapshot
    vfs.getRoot().children = [];
    vfs.getAllFiles().forEach((file: VirtualFile) => {
      vfs.deleteItem(file.path);
    });
    
    // Recreate files from snapshot
    snapshot.forEach((content, path) => {
      const pathParts = path.split('/').filter(Boolean);
      const filename = pathParts[pathParts.length - 1];
      const folderPath = pathParts.length > 1 ? '/' + pathParts.slice(0, -1).join('/') : '/';
      
      // Ensure parent folders exist
      if (folderPath !== '/') {
        const folders = folderPath.split('/').filter(Boolean);
        let currentPath = '';
        for (const folder of folders) {
          currentPath += `/${folder}`;
          if (!vfs.findFolder(currentPath)) {
            const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
            vfs.createNewFolder(parentPath, folder);
          }
        }
      }
      
      // Create the file
      const newFile = vfs.createNewFile(folderPath, filename, content);
      if (newFile && filename === 'voice_agent.py') {
        setCurrentCode(content);
      }
    });
    
    setFileSystemVersion(prev => prev + 1);
  };

  // Update editor when selected file changes
  useEffect(() => {
    const file = vfs.getFile(getSelectedFilePath());
    if (file) {
      setEditorValue(file.content);
      if (file.name === 'voice_agent.py') {
        setCurrentCode(file.content);
      }
    }
  }, [selectedFile, fileSystemVersion]);

  const getSelectedFilePath = (): string => {
    // Find the file path by name
    const allFiles = vfs.getAllFiles();
    const file = allFiles.find(f => f.name === selectedFile);
    return file?.path || '/voice_agent.py';
  };

  // Save editor changes to virtual filesystem
  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setEditorValue(value);
      const filePath = getSelectedFilePath();
      
      // Auto-save with change description
      vfs.updateFile(filePath, value, 'Manual edit');
      
      if (selectedFile === 'voice_agent.py') {
        setCurrentCode(value);
      }
      
      setFileSystemVersion(prev => prev + 1);
      
      // Save file changes to database (debounced)
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveFileChangesToDatabase('Manual file edit');
      }, 2000); // Save after 2 seconds of inactivity
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      // Get the current file content from the real file system
      const content = vfs.getFile(getSelectedFilePath())?.content || '';
      await navigator.clipboard.writeText(content);
      // Create a temporary notification instead of alert
      const notification = document.createElement('div');
      notification.textContent = 'Code copied to clipboard!';
      notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      // Fallback notification
      const notification = document.createElement('div');
      notification.textContent = 'Failed to copy to clipboard';
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 2000);
    }
  };

  const downloadCode = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fetchAvailableNumbers = async () => {
    setIsLoadingNumbers(true);
    try {
      const response = await fetch('/api/telnyx-numbers');
      if (!response.ok) {
        throw new Error('Failed to fetch phone numbers');
      }
      const data = await response.json();
      console.log('Raw Telnyx API response:', data);
      console.log('Phone numbers received:', data.data?.map((num: any) => num.phone_number));
      setAvailableNumbers(data.data || []);
    } catch (error) {
      console.error('Error fetching phone numbers:', error);
      // Show error notification
      const notification = document.createElement('div');
      notification.textContent = 'Failed to load available phone numbers. Please try again.';
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 3000);
    } finally {
      setIsLoadingNumbers(false);
    }
  };

  const assignPhoneNumber = async () => {
    if (!selectedNumber) return;
    
    setIsAssigningNumber(true);
    
    try {
      // Here you would typically make an API call to purchase/assign the number
      // For now, we'll simulate the assignment
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setAssignedPhoneNumber(selectedNumber.phone_number);
      setShowTelephonyModal(false);
      setSelectedNumber(null);
      
      // Show success notification
      const notification = document.createElement('div');
      notification.textContent = `Phone number ${selectedNumber.phone_number} assigned successfully!`;
      notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 max-w-sm';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 4000);
      
    } catch (error) {
      console.error('Error assigning phone number:', error);
      
      // Show error notification
      const notification = document.createElement('div');
      notification.textContent = 'Failed to assign phone number. Please try again.';
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 3000);
    } finally {
      setIsAssigningNumber(false);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isGenerating) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsGenerating(true);

    // Update conversation context with user message
    const updatedContext = `${conversationContext}\n\nUser: ${userMessage.content}`;

    try {
      // Get current file content for context
      const currentFileContent = vfs.getFile(getSelectedFilePath())?.content || '';
      
      // Get all files for context
      const allFiles = vfs.getAllFiles();
      const fileContext = allFiles.map(file => `${file.path}:\n${file.content}`).join('\n\n---\n\n');
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: `You are a helpful coding assistant. 

CONVERSATION CONTEXT:
${updatedContext}

CURRENT PROJECT STATE:
Voice Agent Description: "${config.prompt}"

Current project structure:
${allFiles.map(file => `- ${file.path} (${file.name})`).join('\n')}

Current file being viewed: ${selectedFile} (${getSelectedFilePath()})

Current file content:
\`\`\`python
${currentFileContent}
\`\`\`

All project files for context:
${fileContext}

User request: ${inputMessage}

IMPORTANT INSTRUCTIONS:
1. ALWAYS consider the conversation context when responding
2. Reference previous messages and changes when relevant
3. Only perform file operations when the user explicitly asks you to:
   - Create new files
   - Modify existing code
   - Add features
   - Fix bugs
   - Update configurations

4. DO NOT perform file operations when the user is:
   - Asking questions about the current code
   - Requesting information or explanations
   - Asking "what" or "how" questions
   - Just seeking clarification
   - Asking general questions

5. When the user asks to change configuration values (like STT model), UPDATE the appropriate files

When creating or modifying files, use these formats:

1. For NEW files: Use this format:
   **CREATE FILE: filename.py**
   \`\`\`python
   [file content here]
   \`\`\`

2. For UPDATING existing files: Use this format:
   **UPDATE FILE: filename.py**
   \`\`\`python
   [complete updated file content here]
   \`\`\`

3. For explanations, informational responses, or general questions, just provide normal text without any file operation markers.

Make sure to:
- Only update files when explicitly requested
- Answer general questions directly and helpfully
- Include complete file contents when updating
- Use proper Python imports and structure
- Follow the LiveKit agent pattern for voice agent files
- Create helper files, utilities, or configuration files as needed
- Explain what each file does
- Reference conversation history when relevant

If the user asks to create new functionality, create appropriate new files rather than cramming everything into voice_agent.py.`,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      let responseContent = data.code;
      
      // Parse the response for file operations
      const fileOperations = parseFileOperations(responseContent);
      
      // Apply file operations
      let operationSummary = '';
      let hasFileChanges = false;
      
      for (const operation of fileOperations) {
        hasFileChanges = true;
        // Handle nested file paths (e.g., utils/service_titan.py)
        const filePath = operation.filename;
        const pathParts = filePath.split('/');
        const filename = pathParts[pathParts.length - 1];
        const folderPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '';
        
        // Normalize filename (remove leading slash if present)
        const normalizedFilename = filename.startsWith('/') ? filename.substring(1) : filename;
        const normalizedPath = folderPath ? `/${folderPath}/${normalizedFilename}` : `/${normalizedFilename}`;
        
        if (operation.type === 'CREATE') {
          // Check if file already exists (with any path format)
          const existingFile = vfs.getAllFiles().find(f => 
            f.path === normalizedPath ||
            f.path === `/${filePath}` ||
            (f.name === normalizedFilename && !folderPath) // Only match by name if no folder specified
          );
          
          if (existingFile) {
            // File already exists, update it instead
            vfs.updateFile(existingFile.path, operation.content, `AI: Updated ${filePath} via chat`);
            operationSummary += `✅ Updated existing ${filePath}\n`;
            
            // Update currentCode if it's the main voice agent file
            if (normalizedFilename === 'voice_agent.py') {
              setCurrentCode(operation.content);
            }
          } else {
            // Create new file with proper folder structure
            let newFile;
            if (folderPath) {
              // Ensure parent folder exists
              const parentPath = `/${folderPath}`;
              let parentFolder = vfs.findFolder(parentPath);
              
              if (!parentFolder) {
                // Create parent folder if it doesn't exist
                const folderParts = folderPath.split('/');
                let currentPath = '';
                for (const part of folderParts) {
                  currentPath += `/${part}`;
                  if (!vfs.findFolder(currentPath)) {
                    vfs.createNewFolder(currentPath.substring(0, currentPath.lastIndexOf('/')) || '/', part);
                  }
                }
                parentFolder = vfs.findFolder(parentPath);
              }
              
              if (parentFolder) {
                newFile = vfs.createNewFile(parentPath, normalizedFilename, operation.content);
              }
            } else {
              newFile = vfs.createNewFile('/', normalizedFilename, operation.content);
            }
            
            if (newFile) {
              // Create initial snapshot for new file
              vfs.updateFile(newFile.path, operation.content, `AI: Created ${filePath} via chat`);
              operationSummary += `✅ Created ${filePath}\n`;
              // Switch to the new file if it's the first one created
              if (fileOperations.indexOf(operation) === 0) {
                setSelectedFile(normalizedFilename);
              }
            }
          }
        } else if (operation.type === 'UPDATE') {
          // Find existing file with normalized name and path
          const existingFile = vfs.getAllFiles().find(f => 
            f.path === normalizedPath ||
            f.path === `/${filePath}` ||
            (f.name === normalizedFilename && !folderPath) // Only match by name if no folder specified
          );
          
          if (existingFile) {
            vfs.updateFile(existingFile.path, operation.content, `AI: Updated ${filePath} via chat`);
            operationSummary += `✅ Updated ${filePath}\n`;
            
            // Update currentCode if it's the main voice agent file
            if (normalizedFilename === 'voice_agent.py') {
              setCurrentCode(operation.content);
            }
          } else {
            // File doesn't exist, create it with proper folder structure
            let newFile;
            if (folderPath) {
              // Ensure parent folder exists
              const parentPath = `/${folderPath}`;
              let parentFolder = vfs.findFolder(parentPath);
              
              if (!parentFolder) {
                // Create parent folder if it doesn't exist
                const folderParts = folderPath.split('/');
                let currentPath = '';
                for (const part of folderParts) {
                  currentPath += `/${part}`;
                  if (!vfs.findFolder(currentPath)) {
                    vfs.createNewFolder(currentPath.substring(0, currentPath.lastIndexOf('/')) || '/', part);
                  }
                }
                parentFolder = vfs.findFolder(parentPath);
              }
              
              if (parentFolder) {
                newFile = vfs.createNewFile(parentPath, normalizedFilename, operation.content);
              }
            } else {
              newFile = vfs.createNewFile('/', normalizedFilename, operation.content);
            }
            
            if (newFile) {
              // Create initial snapshot for new file
              vfs.updateFile(newFile.path, operation.content, `AI: Created ${filePath} via chat (file didn't exist)`);
              operationSummary += `✅ Created ${filePath} (file didn't exist)\n`;
            }
          }
        }
      }
      
      // Update file system version to trigger re-render
      if (fileOperations.length > 0) {
        setFileSystemVersion(prev => prev + 1);
      }
      
      // Clean up the response content to remove file operation markers
      let cleanedResponse = responseContent;
      
      // Remove file operation blocks
      cleanedResponse = cleanedResponse.replace(/\*\*(?:CREATE|UPDATE) FILE: [^*]+\*\*\n```[a-zA-Z]*\n[\s\S]*?```\n?/g, '');
      
      // If we performed operations, add a summary
      if (operationSummary) {
        cleanedResponse = `${cleanedResponse}\n\n**File Operations:**\n${operationSummary}`;
      }
      
      // If the response is mostly empty after cleaning, provide a default message
      if (cleanedResponse.trim().length < 50 && operationSummary) {
        cleanedResponse = `I've updated your project files based on your request.\n\n**File Operations:**\n${operationSummary}`;
      }

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: cleanedResponse.trim(),
        timestamp: new Date(),
        checkpoint: hasFileChanges,
        filesSnapshot: hasFileChanges ? createFilesSnapshot() : undefined
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // Update conversation context with assistant response
      const newContext = `${updatedContext}\n\nAssistant: ${cleanedResponse.trim()}`;
      setConversationContext(newContext);
      
      // If this message created file changes, add it to checkpoints
      if (hasFileChanges) {
        setAvailableCheckpoints(prev => [...prev, assistantMessage]);
      }
      
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Rollback to a specific checkpoint
  const rollbackToCheckpoint = (checkpointMessage: ChatMessage) => {
    if (!checkpointMessage.filesSnapshot) return;
    
    // Restore files from checkpoint
    restoreFromCheckpoint(checkpointMessage.filesSnapshot);
    
    // Find the index of this checkpoint in messages
    const checkpointIndex = messages.findIndex(msg => msg.id === checkpointMessage.id);
    if (checkpointIndex !== -1) {
      // Remove all messages after this checkpoint
      const newMessages = messages.slice(0, checkpointIndex + 1);
      setMessages(newMessages);
      
      // Update available checkpoints
      const newCheckpoints = availableCheckpoints.filter(cp => 
        newMessages.some(msg => msg.id === cp.id)
      );
      setAvailableCheckpoints(newCheckpoints);
      
      // Update conversation context to match the rollback point
      const contextMessages = newMessages.map(msg => 
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      ).join('\n\n');
      setConversationContext(`Voice Agent Project: "${config.prompt}"\n\n${contextMessages}`);
    }
    
    showNotification(`Rolled back to checkpoint: ${checkpointMessage.timestamp.toLocaleString()}`, 'success');
    setShowCheckpointModal(false);
  };

  // Parse file operations from AI response
  const parseFileOperations = (content: string): Array<{type: 'CREATE' | 'UPDATE', filename: string, content: string}> => {
    const operations: Array<{type: 'CREATE' | 'UPDATE', filename: string, content: string}> = [];
    
    // Match CREATE FILE operations
    const createRegex = /\*\*CREATE FILE: ([^*]+)\*\*\n```(?:[a-zA-Z]*\n)?([\s\S]*?)```/g;
    let createMatch;
    while ((createMatch = createRegex.exec(content)) !== null) {
      operations.push({
        type: 'CREATE',
        filename: createMatch[1].trim(),
        content: createMatch[2].trim()
      });
    }
    
    // Match UPDATE FILE operations
    const updateRegex = /\*\*UPDATE FILE: ([^*]+)\*\*\n```(?:[a-zA-Z]*\n)?([\s\S]*?)```/g;
    let updateMatch;
    while ((updateMatch = updateRegex.exec(content)) !== null) {
      operations.push({
        type: 'UPDATE',
        filename: updateMatch[1].trim(),
        content: updateMatch[2].trim()
      });
    }
    
    // Fallback: if no explicit file operations found, check for generic code blocks
    if (operations.length === 0) {
      // Look for code blocks that might be file updates
      const codeBlockRegex = /```(?:python|py)?\n([\s\S]*?)```/g;
      let codeMatch;
      while ((codeMatch = codeBlockRegex.exec(content)) !== null) {
        const code = codeMatch[1].trim();
        
        // If it looks like Python code with imports, assume it's for the current file
        if (code.includes('import') || code.includes('def ') || code.includes('class ')) {
          operations.push({
            type: 'UPDATE',
            filename: selectedFile,
            content: code
          });
          break; // Only take the first code block to avoid duplicates
        }
      }
    }
    
    return operations;
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startConversation = async () => {
    setIsConnecting(true);
    
    try {
      console.log('🚀 Starting conversation...');
      
      // IMMEDIATELY set conversation state to prevent any navigation
      console.log('🎯 Setting conversation state to TRUE immediately');
      setIsInConversation(true);
      
      // Generate room connection details
      const url = new URL(
        process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? "/api/connection-details",
        window.location.origin
      );
      
      console.log('📡 Fetching connection details from:', url.toString());
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error(`Failed to get connection details: ${response.status} ${response.statusText}`);
      }
      
      const connectionDetailsData = await response.json();
      console.log('✅ Got connection details:', {
        roomName: connectionDetailsData.roomName,
        hasToken: !!connectionDetailsData.participantToken,
        hasServerUrl: !!connectionDetailsData.serverUrl
      });

      console.log('🔌 Connecting to room:', connectionDetailsData.roomName);
      await room.connect(connectionDetailsData.serverUrl, connectionDetailsData.participantToken);
      await room.localParticipant.setMicrophoneEnabled(true);
      
      console.log('✅ Connected to room successfully');
      console.log('👥 Current participants:', room.remoteParticipants.size);
      
      // Wait for the room to be fully established and for any agents to join
      console.log('⏳ Waiting for room to stabilize...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      console.log('👥 Participants after wait:', room.remoteParticipants.size);
      
      // Send configuration as data message immediately after connecting
      if (config && currentCode) {
        const configMessage = {
          type: 'agent_setup',
          config: config,
          generatedCode: currentCode
        };
        
        console.log('📤 Preparing to send agent configuration:', {
          configKeys: Object.keys(config),
          codeLength: currentCode.length,
          participantCount: room.remoteParticipants.size
        });
        
        // Send as data message to the room
        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify(configMessage));
        
        try {
          // Send multiple times with delays to ensure delivery
          for (let attempt = 1; attempt <= 3; attempt++) {
            await room.localParticipant.publishData(data, { reliable: true });
            console.log(`📤 Sent agent configuration (attempt ${attempt}):`, { 
              messageSize: data.length,
              timestamp: new Date().toISOString()
            });
            
            // Wait between attempts
            if (attempt < 3) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          
        } catch (error) {
          console.error('❌ Failed to send agent configuration:', error);
        }
      }
      
      console.log('🎉 Conversation should now be active');
      
    } catch (error) {
      console.error('❌ Failed to connect to room:', error);
      // If there's an error, reset conversation state
      setIsInConversation(false);
      
      // Show error notification
      const notification = document.createElement('div');
      notification.textContent = `Failed to start conversation: ${error instanceof Error ? error.message : 'Unknown error'}`;
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 max-w-sm';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 5000);
    } finally {
      setIsConnecting(false);
    }
  };

  const endConversation = async () => {
    await room.disconnect();
    setIsInConversation(false);
  };

  // Room event handling
  useEffect(() => {
    const onDeviceFailure = (error: Error) => {
      console.error('Device failure:', error);
      const notification = document.createElement('div');
      notification.textContent = 'Error accessing microphone. Please check permissions and reload.';
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 5000);
    };

    room.on(RoomEvent.MediaDevicesError, onDeviceFailure);

    return () => {
      room.off(RoomEvent.MediaDevicesError, onDeviceFailure);
    };
  }, [room]);

  // Voice Assistant Components
  function SimpleVoiceAssistant() {
    const { state: agentState } = useVoiceAssistant();

    return (
      <div className="flex flex-col items-center gap-4 h-full bg-gray-900" style={{ '--lk-bg': '#111827' } as React.CSSProperties}>
        <AgentVisualizer />
        <div className="flex-1 w-full bg-gray-900">
          <TranscriptionView />
        </div>
        <div className="w-full bg-gray-900">
          <ConversationControlBar />
        </div>
        <RoomAudioRenderer />
        <NoAgentNotification state={agentState} />
      </div>
    );
  }

  function AgentVisualizer() {
    const { state: agentState, videoTrack, audioTrack } = useVoiceAssistant();

    if (videoTrack) {
      return (
        <div className="h-[512px] w-[512px] rounded-lg overflow-hidden bg-gray-900">
          <VideoTrack trackRef={videoTrack} />
        </div>
      );
    }
    return (
      <div className="h-[300px] w-full bg-gray-900">
        <BarVisualizer
          state={agentState}
          barCount={5}
          trackRef={audioTrack}
          className="agent-visualizer"
          options={{ minHeight: 24 }}
        />
      </div>
    );
  }

  function ConversationControlBar() {
    const { state: agentState } = useVoiceAssistant();

    return (
      <div className="relative h-[60px]">
        <AnimatePresence>
          {agentState !== "disconnected" && agentState !== "connecting" && (
            <motion.div
              initial={{ opacity: 0, top: "10px" }}
              animate={{ opacity: 1, top: 0 }}
              exit={{ opacity: 0, top: "-10px" }}
              transition={{ duration: 0.4, ease: [0.09, 1.04, 0.245, 1.055] }}
              className="flex h-8 absolute left-1/2 -translate-x-1/2 justify-center items-center space-x-4"
            >
              <VoiceAssistantControlBar controls={{ leave: false }} />
              <DisconnectButton onClick={endConversation}>
                <CloseIcon />
              </DisconnectButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Show notification helper
  const showNotification = (message: string, type: 'success' | 'error') => {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.className = `fixed top-4 right-4 px-4 py-2 rounded-lg shadow-lg z-50 ${
      type === 'success' ? 'bg-green-500' : 'bg-red-500'
    } text-white`;
    document.body.appendChild(notification);
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 3000);
  };

  // Create new file or folder
  const createFileOrFolder = (name: string, type: 'file' | 'folder', parentPath: string = '/') => {
    if (type === 'file') {
      const file = vfs.createNewFile(parentPath, name);
      if (file) {
        setFileSystemVersion(prev => prev + 1);
        showNotification(`File "${name}" created successfully!`, 'success');
      } else {
        showNotification(`File "${name}" already exists!`, 'error');
      }
    } else {
      const folder = vfs.createNewFolder(parentPath, name);
      if (folder) {
        setFileSystemVersion(prev => prev + 1);
        showNotification(`Folder "${name}" created successfully!`, 'success');
      } else {
        showNotification(`Folder "${name}" already exists!`, 'error');
      }
    }
  };

  // Delete file or folder
  const deleteFileOrFolder = (path: string) => {
    if (vfs.deleteItem(path)) {
      setFileSystemVersion(prev => prev + 1);
      showNotification('Deleted successfully!', 'success');
      
      // If we deleted the currently selected file, switch to voice_agent.py
      if (path === getSelectedFilePath()) {
        setSelectedFile('voice_agent.py');
      }
    } else {
      showNotification('Failed to delete!', 'error');
    }
  };

  // Render file tree
  const renderFileTree = (items: VirtualFileSystemItem[], level: number = 0): JSX.Element[] => {
    return items.map((item) => (
      <div key={item.id} style={{ marginLeft: `${level * 16}px` }}>
        {item.type === 'folder' ? (
          <div>
            <div 
              className="flex items-center justify-between group"
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenuPath(item.path);
                setContextMenuPosition({ x: e.clientX, y: e.clientY });
              }}
            >
              <button
                onClick={() => {
                  vfs.toggleFolder(item.path);
                  setFileSystemVersion(prev => prev + 1);
                }}
                className="flex items-center w-full text-left py-1 px-2 hover:bg-gray-700 rounded text-gray-300 text-sm"
              >
                <svg
                  className={`w-4 h-4 mr-1 transition-transform ${
                    item.expanded ? 'rotate-90' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <svg className="w-4 h-4 mr-2 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                {item.name}
              </button>
              <button
                onClick={() => {
                  setNewFileParentPath(item.path);
                  setNewFileType('file');
                  setShowNewFileModal(true);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-white transition-all"
                title="Add file"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
            {item.expanded && (
              <div>{renderFileTree(item.children, level + 1)}</div>
            )}
          </div>
        ) : (
          <div 
            className="flex items-center justify-between group"
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenuPath(item.path);
              setContextMenuPosition({ x: e.clientX, y: e.clientY });
            }}
          >
            <button
              onClick={() => {
                setSelectedFile(item.name);
              }}
              className={`flex items-center w-full text-left py-1 px-2 hover:bg-gray-700 rounded text-sm ${
                selectedFile === item.name ? 'bg-blue-600 text-white' : 'text-gray-300'
              }`}
            >
              <svg className="w-4 h-4 mr-2 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
              </svg>
              {item.name}
              {item.type === 'file' && (
                <span className="text-xs text-gray-500 ml-2">
                  {getDisplayLanguage(item.name)}
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    ));
  };

  const getFileLanguage = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'py': return 'python';
      case 'js': return 'javascript';
      case 'ts': return 'typescript';
      case 'tsx': return 'typescript';
      case 'jsx': return 'javascript';
      case 'json': return 'json';
      case 'md': return 'markdown';
      case 'txt': return 'plaintext';
      case 'yml':
      case 'yaml': return 'yaml';
      case 'toml': return 'toml';
      case 'env': return 'plaintext';
      default: return 'plaintext';
    }
  };

  const getDisplayLanguage = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'py': return 'Python';
      case 'js': return 'JavaScript';
      case 'ts': return 'TypeScript';
      case 'tsx': return 'TypeScript React';
      case 'jsx': return 'JavaScript React';
      case 'json': return 'JSON';
      case 'md': return 'Markdown';
      case 'txt': return 'Text';
      case 'yml':
      case 'yaml': return 'YAML';
      case 'toml': return 'TOML';
      case 'env': return 'Environment';
      default: return 'Text';
    }
  };

  return (
    <RoomContext.Provider value={room}>
      <div className="w-full h-screen bg-gray-900 flex">
        {/* Left side - Chat conversation */}
        <div className="w-1/3 bg-gray-800 border-r border-gray-700 flex flex-col">
          {/* Chat header */}
          <div className="p-4 border-b border-gray-700 bg-gray-750">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-white">Code Assistant</h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowCheckpointModal(true)}
                  disabled={availableCheckpoints.length === 0}
                  className="flex items-center text-gray-400 hover:text-white transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  title="View checkpoints"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Checkpoints ({availableCheckpoints.length})
                </button>
                <button
                  onClick={onBackToHome}
                  className="flex items-center text-gray-400 hover:text-white transition-colors text-sm"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Home
                </button>
              </div>
            </div>
            <p className="text-gray-400 text-sm">Ask me to modify your voice agent code, add features, or explain how it works</p>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg p-3 ${
                  message.role === 'user' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-200'
                }`}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs opacity-70">
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                    {message.checkpoint && message.role === 'assistant' && message.filesSnapshot && (
                      <button
                        onClick={() => {
                          if (confirm(`Restore to this checkpoint? This will undo all changes made after ${message.timestamp.toLocaleString()}`)) {
                            rollbackToCheckpoint(message);
                          }
                        }}
                        className="ml-2 px-1 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors flex items-center"
                        title="Restore to this checkpoint"
                      >
                        <svg className="w-2.5 h-2.5 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {isGenerating && (
              <div className="flex justify-start">
                <div className="bg-gray-700 text-gray-200 rounded-lg p-3">
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                    <span className="text-sm">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Message input */}
          <div className="p-4 border-t border-gray-700">
            <div className="flex space-x-2">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me to modify the code, add features, or explain something..."
                className="flex-1 p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none resize-none"
                rows={2}
                disabled={isGenerating}
              />
              <button
                onClick={sendMessage}
                disabled={!inputMessage.trim() || isGenerating}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Right side - Code/Test view */}
        <div className="w-2/3 bg-gray-900 flex flex-col">
          {/* Header with toggle and actions */}
          <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
            <div className="flex items-center space-x-4">
              <h2 className="text-lg font-semibold text-white">Voice Agent</h2>
              <div className="flex bg-gray-700 rounded-lg p-1">
                <button
                  onClick={() => setActiveTab('test')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'test'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:text-white hover:bg-gray-600'
                  }`}
                >
                  Test
                </button>
                <button
                  onClick={() => setActiveTab('code')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'code'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:text-white hover:bg-gray-600'
                  }`}
                >
                  Code
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              {activeTab === 'code' && (
                <>
                  <button
                    onClick={() => copyToClipboard(vfs.getFile(getSelectedFilePath())?.content || '')}
                    className="px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-md transition-colors flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Copy</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowTelephonyModal(true);
                      fetchAvailableNumbers();
                    }}
                    className={`px-3 py-2 text-white text-sm rounded-md transition-colors flex items-center space-x-2 ${
                      assignedPhoneNumber 
                        ? 'bg-green-600 hover:bg-green-700' 
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span>{assignedPhoneNumber ? 'Phone Assigned' : 'Add Telephony'}</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'code' ? (
              <div className="h-full bg-gray-900 overflow-hidden flex">
                {/* File menu sidebar */}
                <div className={`bg-gray-800 border-r border-gray-700 transition-all duration-300 flex-shrink-0 ${
                  isFileMenuOpen ? 'w-64 min-w-64' : 'w-0 min-w-0'
                }`}>
                  <div className={`w-64 h-full ${isFileMenuOpen ? 'block' : 'hidden'}`}>
                    <div className="p-3 border-b border-gray-700">
                      <div className="flex items-center text-gray-300 text-sm font-medium">
                        <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                        </svg>
                        Explorer
                      </div>
                      <div className="flex gap-1 mt-2">
                        <button
                          onClick={() => {
                            setNewFileParentPath('/');
                            setNewFileType('file');
                            setShowNewFileModal(true);
                          }}
                          className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-white transition-colors"
                          title="New File"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => {
                            setNewFileParentPath('/');
                            setNewFileType('folder');
                            setShowNewFileModal(true);
                          }}
                          className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-white transition-colors"
                          title="New Folder"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                        <button
                          onClick={() => vfs.toggleFolder('/')}
                          className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-white transition-colors"
                          title="Refresh"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="p-2 overflow-y-auto h-full">
                      {fileSystemVersion >= 0 ? (
                        renderFileTree(vfs.getRoot().children)
                      ) : (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
                          <span className="ml-2 text-gray-400 text-sm">Loading files...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Code editor area */}
                <div className="flex-1 flex flex-col">
                  {/* Code editor header */}
                  <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => {
                          console.log('Files button clicked, current state:', isFileMenuOpen);
                          setIsFileMenuOpen(!isFileMenuOpen);
                          console.log('Files button clicked, new state will be:', !isFileMenuOpen);
                        }}
                        className="flex items-center px-2 py-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors text-sm"
                        title={isFileMenuOpen ? 'Hide file explorer' : 'Show file explorer'}
                      >
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                        Files
                      </button>
                      <div className="flex space-x-1">
                        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                        <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      </div>
                      <span className="text-gray-400 text-sm font-mono">{selectedFile}</span>
                    </div>
                    <div className="text-gray-400 text-xs">{getDisplayLanguage(selectedFile)}</div>
                  </div>

                  {/* Code content */}
                  <div className="flex-1 overflow-auto bg-gray-900">
                    <Editor
                      value={editorValue}
                      onChange={handleEditorChange}
                      language={getFileLanguage(selectedFile)}
                      theme="vs-dark"
                      options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        lineNumbers: 'on',
                        scrollbar: {
                          vertical: 'auto',
                          horizontal: 'auto',
                        },
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col">
                {/* Agent description */}
                <div className="p-6 bg-gray-800 border-b border-gray-700">
                  <h3 className="text-lg font-semibold text-white mb-3">Agent Description</h3>
                  <div className="bg-gray-700 rounded-lg p-4">
                    <p className="text-gray-300 leading-relaxed">{config.prompt}</p>
                  </div>
                </div>

                {/* Test area - Show voice interface if connected, otherwise show start button */}
                <div className="flex-1 bg-gray-900">
                  {isInConversation ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 bg-gray-900">
                      <SimpleVoiceAssistant />
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center space-y-6 p-8 max-w-md mx-auto">
                        <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto">
                          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                        </div>
                        <div className="flex flex-col items-center">
                          <h3 className="text-2xl font-semibold text-white mb-3">Ready to Test</h3>
                          <p className="text-gray-400 mb-6">Your voice agent is configured and ready for testing. Make sure your backend agent is running.</p>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              startConversation();
                            }}
                            disabled={isConnecting}
                            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-lg flex items-center justify-center mx-auto"
                          >
                            {isConnecting ? (
                              <>
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                                Connecting...
                              </>
                            ) : (
                              'Start Conversation'
                            )}
                          </button>
                        </div>
                        
                        <div className="border-t border-gray-700 pt-6">
                          <h4 className="text-md font-medium text-white mb-3">Testing Tips</h4>
                          <ul className="text-gray-400 text-sm space-y-2 text-left">
                            <li>• Speak clearly and wait for the agent to respond</li>
                            <li>• Try asking questions related to your agent's purpose</li>
                            <li>• Test different conversation scenarios</li>
                            <li>• Use the chat on the left to modify the agent's behavior</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Telephony Modal */}
        {showTelephonyModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center">
                  <svg className="w-5 h-5 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Add Telephony
                </h3>
                <button
                  onClick={() => setShowTelephonyModal(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {assignedPhoneNumber ? (
                <div className="space-y-4">
                  <div className="bg-green-900/30 border border-green-700 rounded-lg p-4">
                    <div className="flex items-center text-green-400 mb-2">
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Phone Number Assigned
                    </div>
                    <p className="text-white font-mono text-lg">{assignedPhoneNumber}</p>
                    <p className="text-gray-400 text-sm mt-2">
                      Your voice agent is now accessible via phone calls to this number.
                    </p>
                  </div>

                  <div className="bg-gray-700 rounded-lg p-4">
                    <h4 className="text-white font-medium mb-2">Next Steps:</h4>
                    <ul className="text-gray-300 text-sm space-y-1">
                      <li>• Configure your agent's telephony settings</li>
                      <li>• Test the phone number integration</li>
                      <li>• Monitor call analytics and performance</li>
                    </ul>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowTelephonyModal(false)}
                      className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                    >
                      Done
                    </button>
                    <button
                      onClick={() => {
                        setAssignedPhoneNumber(null);
                        setShowTelephonyModal(false);
                      }}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                      Remove Number
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-gray-300">
                    <p className="mb-4">
                      Choose a phone number to make your voice agent accessible via traditional phone calls. 
                      This enables customers to interact with your agent using any phone.
                    </p>
                  </div>

                  {isLoadingNumbers ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
                      <span className="ml-3 text-gray-300">Loading available numbers...</span>
                    </div>
                  ) : availableNumbers.length > 0 ? (
                    <div className="space-y-4">
                      <h4 className="text-white font-medium">Available Phone Numbers:</h4>
                      <div className="max-h-64 overflow-y-auto space-y-2">
                        {availableNumbers.slice(0, 10).map((number, index) => (
                          <div
                            key={index}
                            onClick={() => setSelectedNumber(number)}
                            className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                              selectedNumber?.phone_number === number.phone_number
                                ? 'border-blue-500 bg-blue-900/30'
                                : 'border-gray-600 hover:border-gray-500 bg-gray-700/50'
                            }`}
                          >
                            <div className="flex justify-between items-start gap-4">
                              <div className="flex-1 min-w-0">
                                <p className="text-white font-mono text-lg break-all">{number.phone_number}</p>
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {number.features?.map((feature: any, idx: number) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-1 bg-gray-600 text-gray-300 text-xs rounded whitespace-nowrap"
                                    >
                                      {feature.name}
                                    </span>
                                  ))}
                                </div>
                                {number.region_information?.[0] && (
                                  <p className="text-gray-400 text-sm mt-1">
                                    Region: {number.region_information[0].region_name}
                                  </p>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-green-400 font-medium">
                                  ${parseFloat(number.cost_information?.monthly_cost || '0').toFixed(2)}/month
                                </p>
                                <p className="text-gray-400 text-sm">
                                  ${parseFloat(number.cost_information?.upfront_cost || '0').toFixed(2)} setup
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-gray-400">No phone numbers available at the moment.</p>
                      <button
                        onClick={fetchAvailableNumbers}
                        className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowTelephonyModal(false);
                        setSelectedNumber(null);
                      }}
                      className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={assignPhoneNumber}
                      disabled={isAssigningNumber || !selectedNumber}
                      className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center"
                    >
                      {isAssigningNumber ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Assigning...
                        </>
                      ) : (
                        'Get Selected Number'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* New File/Folder Modal */}
        {showNewFileModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  Create New {newFileType === 'file' ? 'File' : 'Folder'}
                </h3>
                <button
                  onClick={() => {
                    setShowNewFileModal(false);
                    setNewFileName('');
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {newFileType === 'file' ? 'File' : 'Folder'} Name
                  </label>
                  <input
                    type="text"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    placeholder={newFileType === 'file' ? 'example.py' : 'folder-name'}
                    className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                    autoFocus
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && newFileName.trim()) {
                        createFileOrFolder(newFileName.trim(), newFileType, newFileParentPath);
                        setShowNewFileModal(false);
                        setNewFileName('');
                      }
                    }}
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowNewFileModal(false);
                      setNewFileName('');
                    }}
                    className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (newFileName.trim()) {
                        createFileOrFolder(newFileName.trim(), newFileType, newFileParentPath);
                        setShowNewFileModal(false);
                        setNewFileName('');
                      }
                    }}
                    disabled={!newFileName.trim()}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Context Menu */}
        {contextMenuPosition && contextMenuPath && (
          <div
            className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50 py-1"
            style={{
              left: contextMenuPosition.x,
              top: contextMenuPosition.y,
            }}
            onMouseLeave={() => {
              setContextMenuPosition(null);
              setContextMenuPath(null);
            }}
          >
            <button
              onClick={() => {
                setNewFileType('file');
                setShowNewFileModal(true);
                setContextMenuPosition(null);
              }}
              className="w-full px-4 py-2 text-left text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              New File
            </button>
            <button
              onClick={() => {
                setNewFileType('folder');
                setShowNewFileModal(true);
                setContextMenuPosition(null);
              }}
              className="w-full px-4 py-2 text-left text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Folder
            </button>
            {contextMenuPath !== '/' && (
              <button
                onClick={() => {
                  if (confirm(`Are you sure you want to delete "${contextMenuPath}"?`)) {
                    vfs.deleteItem(contextMenuPath);
                  }
                  setContextMenuPosition(null);
                  setContextMenuPath(null);
                }}
                className="w-full px-4 py-2 text-left text-red-400 hover:bg-gray-700 hover:text-red-300 transition-colors flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            )}
          </div>
        )}

        {/* Click outside to close context menu */}
        {contextMenuPosition && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setContextMenuPosition(null);
              setContextMenuPath(null);
            }}
          />
        )}

        {/* File History Modal */}
        {showHistoryModal && historyFile && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-4xl max-h-[80vh] overflow-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  File History: {historyFile.path.split('/').pop()}
                </h3>
                <button
                  onClick={() => {
                    setHistoryFile(null);
                    setShowHistoryModal(false);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                {(() => {
                  const history = vfs.getFileHistory(historyFile.path);
                  const currentFile = vfs.getFile(historyFile.path);
                  
                  if (!currentFile) return <p>File not found</p>;
                  
                  return (
                    <div className="space-y-3">
                      {/* Current version */}
                      <div className="border rounded-lg p-4 bg-green-50">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium text-green-700">
                            Current (v{currentFile.version})
                          </span>
                          <span className="text-sm text-gray-500">
                            {currentFile.modified.toLocaleString()}
                          </span>
                        </div>
                        <pre className="text-sm bg-gray-100 p-2 rounded overflow-x-auto max-h-40">
                          {currentFile.content}
                        </pre>
                      </div>
                      
                      {/* Historical versions */}
                      {history.map((snapshot) => (
                        <div key={snapshot.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-medium">
                              v{snapshot.version}
                              {snapshot.changeDescription && (
                                <span className="text-sm text-gray-600 ml-2">
                                  - {snapshot.changeDescription}
                                </span>
                              )}
                            </span>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm text-gray-500">
                                {snapshot.timestamp.toLocaleString()}
                              </span>
                              <button
                                onClick={() => {
                                  if (confirm(`Revert to version ${snapshot.version}?`)) {
                                    vfs.revertToSnapshot(historyFile.path, snapshot.id);
                                    setFileSystemVersion(prev => prev + 1);
                                    setHistoryFile(null);
                                    setShowHistoryModal(false);
                                  }
                                }}
                                className="px-2 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600"
                              >
                                Revert
                              </button>
                            </div>
                          </div>
                          <pre className="text-sm bg-gray-100 p-2 rounded overflow-x-auto max-h-40">
                            {snapshot.content}
                          </pre>
                          {snapshot.diff && (
                            <details className="mt-2">
                              <summary className="text-sm text-blue-600 cursor-pointer">
                                View Changes
                              </summary>
                              <pre className="text-xs bg-blue-50 p-2 rounded mt-1 overflow-x-auto">
                                {snapshot.diff}
                              </pre>
                            </details>
                          )}
                        </div>
                      ))}
                      
                      {history.length === 0 && (
                        <p className="text-gray-500 text-center py-4">
                          No version history available
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
              
              <div className="flex justify-end mt-6">
                <button
                  onClick={() => {
                    setHistoryFile(null);
                    setShowHistoryModal(false);
                  }}
                  className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Checkpoint Modal */}
        {showCheckpointModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 border border-gray-700 max-h-[80vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center">
                  <svg className="w-5 h-5 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Chat Checkpoints
                </h3>
                <button
                  onClick={() => setShowCheckpointModal(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {availableCheckpoints.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-gray-400 text-sm mb-4">
                      Roll back your project to any previous state where code changes were made.
                    </p>
                    {availableCheckpoints.map((checkpoint, index) => (
                      <div key={checkpoint.id} className="border border-green-600 bg-green-900/20 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-1 bg-green-600 text-white text-xs rounded font-medium">
                              Checkpoint {index + 1}
                            </span>
                            <span className="text-gray-300 text-sm">
                              {checkpoint.timestamp.toLocaleString()}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              if (confirm(`Roll back to this checkpoint? This will undo all changes made after ${checkpoint.timestamp.toLocaleString()}`)) {
                                rollbackToCheckpoint(checkpoint);
                              }
                            }}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                          >
                            Roll Back
                          </button>
                        </div>
                        <p className="text-gray-300 text-sm leading-relaxed">
                          {checkpoint.content.length > 200 
                            ? `${checkpoint.content.substring(0, 200)}...` 
                            : checkpoint.content
                          }
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-400">No checkpoints available yet.</p>
                    <p className="text-gray-500 text-sm mt-1">Checkpoints are created when code changes are made.</p>
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-4">
                <button
                  onClick={() => setShowCheckpointModal(false)}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoomContext.Provider>
  );
} 