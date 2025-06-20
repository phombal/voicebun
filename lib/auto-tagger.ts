const VALID_CATEGORIES = [
  'Healthcare',
  'Education', 
  'Customer Service',
  'Personal Assistant',
  'Sales & Marketing',
  'Entertainment',
  'Productivity',
  'other'
] as const;

export type ProjectCategory = typeof VALID_CATEGORIES[number];

interface ProjectContent {
  systemPrompt: string;
  title?: string;
  description?: string;
  publicDescription?: string;
}

export async function autoTagProject(content: ProjectContent): Promise<ProjectCategory | null> {
  try {
    // Only run on server-side
    if (typeof window !== 'undefined') {
      console.log('⚠️ Auto-tagging skipped - running on client-side');
      return null;
    }

    // Don't attempt tagging if no OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.log('⚠️ No OpenAI API key - skipping auto-tagging');
      return null;
    }

    // Dynamically import OpenAI only when needed on server-side
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Combine all available content for analysis
    const analysisText = [
      content.title && `Title: ${content.title}`,
      content.description && `Description: ${content.description}`,
      content.publicDescription && `Public Description: ${content.publicDescription}`,
      content.systemPrompt && `System Prompt: ${content.systemPrompt}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    if (!analysisText.trim()) {
      console.log('⚠️ No content available for auto-tagging');
      return null;
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are an AI categorization expert. Analyze the provided voice agent project content and categorize it into ONE of these categories:

${VALID_CATEGORIES.map(cat => `- ${cat}`).join('\n')}

Category Definitions:
- Healthcare: Medical assistance, health advice, patient support, medical scheduling, health monitoring
- Education: Learning assistance, tutoring, educational content, teaching tools, academic support
- Customer Service: Customer support, help desk, complaint handling, order assistance, FAQ answering
- Personal Assistant: Personal scheduling, reminders, task management, general assistance, lifestyle help
- Sales & Marketing: Lead generation, sales support, marketing automation, promotional content, customer acquisition
- Entertainment: Games, storytelling, jokes, music recommendations, creative content, fun interactions
- Productivity: Work tools, business automation, task optimization, workflow management, efficiency tools

Instructions:
1. Analyze the voice agent's purpose, functionality, and target use case
2. Choose the SINGLE most appropriate category
3. Respond with ONLY the category name (exactly as listed above)
4. If the project doesn't clearly fit any category, respond with "uncategorized"

Be decisive and choose the best fit based on the primary use case.`
        },
        {
          role: 'user',
          content: `Please categorize this voice agent project:\n\n${analysisText}`
        }
      ],
      max_tokens: 50,
      temperature: 0.1,
    });

    const suggestedCategory = response.choices[0]?.message?.content?.trim();
    
    // Validate the response
    if (suggestedCategory && VALID_CATEGORIES.includes(suggestedCategory as ProjectCategory)) {
      console.log(`🏷️ Auto-tagged project as: ${suggestedCategory}`);
      return suggestedCategory as ProjectCategory;
    } else if (suggestedCategory?.toLowerCase() === 'uncategorized') {
      console.log('🏷️ Project marked as uncategorized');
      return null;
    } else {
      console.log(`⚠️ Invalid category suggestion: ${suggestedCategory}`);
      return null;
    }

  } catch (error) {
    console.error('❌ Auto-tagging failed:', error);
    return null;
  }
}

// Helper function to get category color for UI display
export function getCategoryColor(category: ProjectCategory | null): string {
  const colors: Record<ProjectCategory, string> = {
    'Healthcare': 'bg-red-100 text-red-800',
    'Education': 'bg-blue-100 text-blue-800',
    'Customer Service': 'bg-green-100 text-green-800',
    'Personal Assistant': 'bg-purple-100 text-purple-800',
    'Sales & Marketing': 'bg-orange-100 text-orange-800',
    'Entertainment': 'bg-pink-100 text-pink-800',
    'Productivity': 'bg-gray-100 text-gray-800',
    'other': 'bg-gray-50 text-gray-600'
  };
  
  return category ? colors[category] : 'bg-gray-50 text-gray-600';
}

// Helper function to get category emoji
export function getCategoryEmoji(category: ProjectCategory | null): string {
  const emojis: Record<ProjectCategory, string> = {
    'Healthcare': '🏥',
    'Education': '📚',
    'Customer Service': '💬',
    'Personal Assistant': '🤖',
    'Sales & Marketing': '📈',
    'Entertainment': '🎉',
    'Productivity': '⚡',
    'other': '📁'
  };
  
  return category ? emojis[category] : '📁';
} 