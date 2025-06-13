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

    const systemPromptGenerationPrompt = `You are an expert at creating detailed system prompts for AI voice agents. 

Create a comprehensive system prompt for a voice agent based on this user description: "${user_prompt}"

The system prompt should:
- Be detailed and specific to the user's request
- Include personality traits appropriate for the role
- Specify conversation guidelines and best practices
- Include greeting and closing instructions
- Be optimized for voice interactions (concise, natural)
- Include error handling and edge case instructions
- Be professional yet engaging
- Include specific examples of how to handle common scenarios

Context: ${context}
Tone: ${tone}
Domain: ${domain}

Return a detailed system prompt that will make the voice agent excellent at their specific role. The prompt should be between 800-1500 characters and ready to use directly in a voice agent system.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPromptGenerationPrompt
        },
        {
          role: 'user',
          content: `Generate a system prompt for: ${user_prompt}`
        }
      ],
      max_tokens: 800,
      temperature: 0.7,
    });

    const generatedSystemPrompt = completion.choices[0]?.message?.content;

    if (!generatedSystemPrompt) {
      throw new Error('Failed to generate system prompt');
    }

    const response = {
      system_prompt: generatedSystemPrompt,
      original_prompt: user_prompt,
      metadata: {
        tone,
        domain,
        context,
        model_used: 'gpt-4o',
        prompt_length: generatedSystemPrompt.length,
        tokens_used: completion.usage?.total_tokens || 0
      }
    };

    console.log('✅ Generated system prompt successfully');
    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ Error generating system prompt:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to generate system prompt',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 