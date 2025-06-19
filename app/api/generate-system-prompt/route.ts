import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { user_prompt, context = 'Voice agent assistant', tone = 'professional', domain = 'general' } = await request.json();

    if (!user_prompt) {
      return NextResponse.json(
        { error: 'user_prompt is required' },
        { status: 400 }
      );
    }

    console.log('🤖 Generating system prompt for:', user_prompt);

    const systemPromptGenerationPrompt = `You are an expert at creating detailed system prompts and welcome messages for AI voice agents. 

Create a comprehensive system prompt and welcome message for a voice agent based on this user description: "${user_prompt}"

The system prompt should:
- Be detailed and specific to the user's request
- Include personality traits appropriate for the role
- Specify conversation guidelines and best practices
- Include greeting and closing instructions
- Be optimized for voice interactions (concise, natural)
- Include error handling and edge case instructions
- Be professional yet engaging
- Include specific examples of how to handle common scenarios

The welcome message should:
- Be a brief, friendly greeting (1-2 sentences)
- Introduce the agent's purpose clearly
- Be warm and inviting
- Set expectations for what the agent can help with
- Be natural for voice delivery (avoid complex punctuation)

Context: ${context}
Tone: ${tone}
Domain: ${domain}

IMPORTANT: Please format your response as JSON with the following structure:
{
  "system_prompt": "The detailed system prompt content here...",
  "welcome_message": "The brief welcome message here..."
}

Return ONLY the JSON response without any markdown formatting, headers, or additional text. The system prompt should be between 800-1500 characters and the welcome message should be 1-2 sentences (50-150 characters).`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPromptGenerationPrompt
        },
        {
          role: 'user',
          content: `Generate a system prompt and welcome message for: ${user_prompt}`
        }
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const generatedContent = completion.choices[0]?.message?.content;

    if (!generatedContent) {
      throw new Error('Failed to generate system prompt and welcome message');
    }

    // Parse the JSON response
    let parsedContent;
    try {
      parsedContent = JSON.parse(generatedContent);
    } catch (parseError) {
      // Fallback: try to extract system prompt and welcome message manually
      console.warn('Failed to parse JSON response, attempting manual extraction');
      
      // Try to find system_prompt and welcome_message in the response
      const systemPromptMatch = generatedContent.match(/"system_prompt":\s*"([^"]+)"/);
      const welcomeMessageMatch = generatedContent.match(/"welcome_message":\s*"([^"]+)"/);
      
      if (systemPromptMatch && welcomeMessageMatch) {
        parsedContent = {
          system_prompt: systemPromptMatch[1],
          welcome_message: welcomeMessageMatch[1]
        };
      } else {
        // Last resort: split content or use original logic for system prompt only
        parsedContent = {
          system_prompt: generatedContent.trim(),
          welcome_message: "Hello! I'm here to help you. How can I assist you today?"
        };
      }
    }

    // Clean up the generated content
    const cleanedSystemPrompt = (parsedContent.system_prompt || '')
      .replace(/\[System Prompt Start\]/gi, '')
      .replace(/\[System Prompt End\]/gi, '')
      .replace(/\[System Prompt for.*?\]/gi, '')
      .replace(/^\*\*System Prompt\*\*:?\s*/gi, '')
      .replace(/^\*\*Role:\*\*.*?\n/gi, '')
      .trim();

    const cleanedWelcomeMessage = (parsedContent.welcome_message || '')
      .replace(/^\*\*Welcome Message\*\*:?\s*/gi, '')
      .trim();

    const response = {
      system_prompt: cleanedSystemPrompt,
      welcome_message: cleanedWelcomeMessage,
      original_prompt: user_prompt,
      metadata: {
        tone,
        domain,
        context,
        model_used: 'gpt-4o',
        system_prompt_length: cleanedSystemPrompt.length,
        welcome_message_length: cleanedWelcomeMessage.length,
        tokens_used: completion.usage?.total_tokens || 0
      }
    };

    console.log('✅ Generated system prompt and welcome message successfully');
    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ Error generating system prompt:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to generate system prompt and welcome message',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 