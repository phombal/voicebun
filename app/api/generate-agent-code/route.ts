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
          content: "You are a Python code generator specialized in LiveKit agents. Generate ONLY executable Python code that follows the LiveKit agents framework structure. Do not include any explanatory text, markdown formatting, or comments. Return pure Python code that can be executed directly."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.7,
    });

    const generatedCode = completion.choices[0]?.message?.content?.trim() || '';

    return Response.json({ 
      code: generatedCode
    });

  } catch (error: unknown) {
    console.error('Error generating agent code:', error);
    return Response.json(
      { error: 'Failed to generate agent code' },
      { status: 500 }
    );
  }
} 