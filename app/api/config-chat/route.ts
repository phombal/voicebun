import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ConfigurationContext {
  systemPrompt: string;
  agentInstructions: string;
  firstMessageMode: string;
  llmProvider: string;
  llmModel: string;
  llmTemperature: number;
  llmMaxResponseLength: number;
  sttProvider: string;
  sttLanguage: string;
  sttQuality: string;
  sttProcessingMode: string;
  sttNoiseSuppression: boolean;
  sttAutoPunctuation: boolean;
  ttsProvider: string;
  ttsVoice: string;
  phoneNumber: string | null;
  phoneInboundEnabled: boolean;
  phoneOutboundEnabled: boolean;
  phoneRecordingEnabled: boolean;
  responseLatencyPriority: string;
  knowledgeBaseFiles: Array<{name: string; type: string; content: string; size: number}>;
  functionsEnabled: boolean;
  customFunctions: Array<{name: string; description: string; parameters: Record<string, any>}>;
  webhooksEnabled: boolean;
  webhookUrl: string | null;
  webhookEvents: string[];
}

interface RequestBody {
  messages: Message[];
  configuration: ConfigurationContext;
}

interface ConfigurationUpdate {
  field: string;
  value: any;
  reason: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const { messages, configuration } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    if (!configuration) {
      return NextResponse.json({ error: 'Configuration context is required' }, { status: 400 });
    }

    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not configured');
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    console.log('Starting configuration chat request with', messages.length, 'messages');

    // Create a streaming response
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const systemPrompt = `You are an expert voice agent configuration assistant. You help users configure their voice agents by understanding their requirements and suggesting optimal settings.

CURRENT CONFIGURATION:
${JSON.stringify(configuration, null, 2)}

CONFIGURATION FIELDS AND OPTIONS:
- systemPrompt: Free text for agent behavior and personality
- agentInstructions: Additional instructions for the agent
- firstMessageMode: "wait" | "speak_first" | "speak_first_with_model_generated_message"
- llmProvider: "openai" | "anthropic"
- llmModel: For OpenAI: "gpt-4o-mini" | "gpt-4o" | "gpt-4.1" | "gpt-4.1-mini" | "gpt-4.1-nano", For Anthropic: "claude-opus-4" | "claude-sonnet-4" | "claude-3-5-haiku"
- llmTemperature: 0.0 to 2.0 (0 = conservative, 1 = balanced, 2 = creative)
- llmMaxResponseLength: 150 | 300 | 500 | 1000 (tokens)
- sttProvider: "deepgram" (only option)
- sttLanguage: "en" | "es" | "fr" | "de" | "it" | "pt" | "ja" | "ko" | "zh"
- sttQuality: "standard" | "enhanced" | "premium"
- sttProcessingMode: "streaming" | "batch"
- sttNoiseSuppression: boolean
- sttAutoPunctuation: boolean
- ttsProvider: "cartesia" | "elevenlabs" | "openai"
- ttsVoice: "neutral" | "male" | "british_male" | "deep_male" | "female" | "soft_female"
- phoneInboundEnabled: boolean
- phoneOutboundEnabled: boolean
- phoneRecordingEnabled: boolean
- responseLatencyPriority: "speed" | "balanced" | "quality"
- functionsEnabled: boolean
- webhooksEnabled: boolean

RESPONSE FORMAT:
When suggesting configuration changes, use this JSON format at the end of your response:

CONFIG_UPDATES:
\`\`\`json
[
  {
    "field": "fieldName",
    "value": "newValue",
    "reason": "Explanation for this change"
  }
]
\`\`\`

GUIDELINES:
1. Always explain WHY you're suggesting configuration changes
2. Consider the user's use case and requirements
3. Suggest complementary settings (e.g., if changing to a creative use case, suggest higher temperature)
4. Only suggest changes that are necessary and beneficial
5. Provide clear explanations for each suggestion
6. If no configuration changes are needed, don't include the CONFIG_UPDATES section

Examples of good suggestions:
- If user wants a customer service agent, suggest professional tone, balanced temperature, enhanced STT quality
- If user wants a creative storytelling agent, suggest higher temperature, longer response length
- If user mentions poor audio quality, suggest premium STT quality and noise suppression
- If user wants faster responses, suggest speed priority and shorter response length

Your primary job is to help users optimize their voice agent configuration for their specific use case.`;

          // Convert messages to OpenAI format
          const openaiMessages = [
            { role: 'system' as const, content: systemPrompt },
            ...messages.map(msg => ({
              role: msg.role as 'user' | 'assistant',
              content: msg.content
            }))
          ];

          console.log('Creating OpenAI stream...');

          // Create the streaming request
          const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: openaiMessages,
            max_tokens: 2000,
            temperature: 0.7,
            stream: true,
          });

          console.log('OpenAI stream created, processing chunks...');

          let fullContent = '';

          for await (const chunk of response) {
            const delta = chunk.choices[0]?.delta?.content || '';
            if (delta) {
              fullContent += delta;
              
              // Send incremental update
              const data = JSON.stringify({
                type: 'content_delta',
                content: delta,
                fullContent: fullContent
              });
              
              controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            }
          }

          console.log('Stream completed, processing configuration updates...');

          // Parse configuration updates from the response
          const configUpdates: ConfigurationUpdate[] = [];
          const configUpdateMatch = fullContent.match(/CONFIG_UPDATES:\s*```json\s*([\s\S]*?)\s*```/);
          
          if (configUpdateMatch) {
            try {
              const updates = JSON.parse(configUpdateMatch[1]);
              if (Array.isArray(updates)) {
                configUpdates.push(...updates);
                console.log('Found configuration updates:', configUpdates.length);
              }
            } catch (error) {
              console.error('Failed to parse configuration updates:', error);
            }
          }

          // Send completion signal with configuration updates
          const completeData = JSON.stringify({
            type: 'complete',
            content: fullContent,
            configurationUpdates: configUpdates
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