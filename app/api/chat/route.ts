import OpenAI from 'openai';

export async function POST(request: Request) {
  try {
    const { prompt, apiKey } = await request.json();

    if (!prompt) {
      return Response.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Prioritize environment variable, fall back to provided API key
    const openaiApiKey = process.env.OPENAI_API_KEY || apiKey;
    
    if (!openaiApiKey) {
      return Response.json({ error: 'OpenAI API key is required (configure OPENAI_API_KEY environment variable)' }, { status: 500 });
    }

    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful coding assistant that can answer both general questions and help with code. When the user asks for code modifications, use the specified file operation formats. When they ask general questions or request information, provide clear and helpful answers without any file operations."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.7,
    });

    const response = completion.choices[0]?.message?.content?.trim() || '';

    return Response.json({ 
      code: response
    });

  } catch (error: any) {
    console.error('Error in chat:', error);
    return Response.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    );
  }
} 