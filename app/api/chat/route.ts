import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface FileContext {
  filename: string;
  content: string;
  path: string;
}

interface RequestBody {
  messages: Message[];
  fileContext?: FileContext[];
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const { messages, fileContext } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    // Check if API key is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY is not configured');
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    console.log('Starting streaming request with', messages.length, 'messages');
    if (fileContext && fileContext.length > 0) {
      console.log('Including file context for', fileContext.length, 'files');
    }

    // Create a streaming response
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Build file context section for system prompt
          let fileContextSection = '';
          if (fileContext && fileContext.length > 0) {
            fileContextSection = `

**CURRENT PROJECT FILES:**
The user has the following files in their project. Use this context to understand the existing codebase and make informed modifications:

${fileContext.map(file => `
**${file.filename}** (${file.path}):
\\\`\\\`\\\`
${file.content}
\\\`\\\`\\\`
`).join('\n')}

When modifying existing files, consider the current implementation and maintain consistency with the existing code style and patterns.
`;
          }

          const systemPrompt = `You are an expert voice agent developer specializing in LiveKit Agents framework.

CRITICAL FILE FORMAT RULES - FOLLOW EXACTLY:

When providing code changes, you MUST use this EXACT format with NO variations:

CREATE_FILE:filename.ext
\\\`\\\`\\\`language
[complete file content]
\\\`\\\`\\\`

UPDATE_FILE:filename.ext
\\\`\\\`\\\`language
[complete file content]
\\\`\\\`\\\`

STRICT RULES:
1. Use EXACTLY "CREATE_FILE:" or "UPDATE_FILE:" (with colon, no spaces before colon)
2. Put filename immediately after colon with NO spaces
3. Use complete filename with extension
4. Put code block on next line with proper language identifier
5. Provide COMPLETE file contents, never partial
6. Do NOT use any other format or headers
7. Do NOT add "Files modified" sections
8. Do NOT use ### headers or ** formatting

CORRECT EXAMPLE:
CREATE_FILE:voice_agent.py
\\\`\\\`\\\`python
import asyncio
from livekit import agents
# complete file here
\\\`\\\`\\\`

UPDATE_FILE:requirements.txt
\\\`\\\`\\\`txt
livekit-agents==0.8.0
# complete file here
\\\`\\\`\\\`

WRONG EXAMPLES (DO NOT USE):
- ### CREATE_FILE: filename.ext
- **Files modified:**
- code blocks without CREATE_FILE/UPDATE_FILE
- Any other format

${fileContextSection}

Available capabilities:
- LiveKit Agents framework
- Multiple STT/TTS/LLM providers
- Voice Activity Detection
- Real-time audio processing

Always provide complete, runnable code following LiveKit best practices.`;

          // Convert messages to Anthropic format
          const anthropicMessages = messages.map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content
          }));

          console.log('Creating Anthropic stream with web search enabled...');

          // Create the streaming request with web search tool
          const response = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-latest',
            max_tokens: 4000,
            system: systemPrompt,
            messages: anthropicMessages,
            tools: [{
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 5
            }],
            stream: true,
          });

          console.log('Anthropic stream created, processing chunks...');

          let fullContent = '';

          for await (const chunk of response) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              fullContent += chunk.delta.text;
              
              // Send incremental update
              const data = JSON.stringify({
                type: 'content_delta',
                content: chunk.delta.text,
                fullContent: fullContent
              });
              
              controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            }
          }

          console.log('Stream completed, sending final data...');

          // Send completion signal
          const completeData = JSON.stringify({
            type: 'complete',
            content: fullContent
          });
          
          controller.enqueue(new TextEncoder().encode(`data: ${completeData}\n\n`));
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          
        } catch (error) {
          console.error('Streaming error:', error);
          const errorData = JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          controller.enqueue(new TextEncoder().encode(`data: ${errorData}\n\n`));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}