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

    // Detect @ mentions for tool integration
    const toolMentions = prompt.match(/@([a-zA-Z_]+)/g) || [];
    const mentionedTools = toolMentions.map((mention: string) => mention.toLowerCase().replace('@', ''));
    
    let enhancedPrompt = prompt;
    
    // Add tool-specific context if @ mentions are detected
    if (mentionedTools.length > 0) {
      const toolTemplates: Record<string, string> = {
        'google_calendar': `
GOOGLE CALENDAR INTEGRATION:
When implementing Google Calendar functionality, use this complete template:

\`\`\`python
from livekit.agents import function_tool, ToolError, RunContext
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from datetime import datetime, timedelta
import json
from typing import Any

@function_tool()
async def schedule_meeting(
    self,
    context: RunContext,
    title: str,
    start_time: str,
    duration_minutes: int = 60,
    attendees: str = "",
    description: str = ""
) -> dict[str, Any]:
    """Schedule a meeting on Google Calendar.
    
    Args:
        title: Meeting title/summary
        start_time: Start time in ISO format (e.g., "2024-01-15T14:00:00")
        duration_minutes: Meeting duration in minutes
        attendees: Comma-separated list of attendee emails
        description: Meeting description
    
    Returns:
        Dictionary containing meeting details and calendar link
    """
    try:
        # Initialize Google Calendar API
        creds = Credentials.from_authorized_user_file('token.json', ['https://www.googleapis.com/auth/calendar'])
        service = build('calendar', 'v3', credentials=creds)
        
        # Parse start time and calculate end time
        start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        end_dt = start_dt + timedelta(minutes=duration_minutes)
        
        # Prepare attendees list
        attendee_list = []
        if attendees:
            for email in attendees.split(','):
                attendee_list.append({'email': email.strip()})
        
        # Create event
        event = {
            'summary': title,
            'description': description,
            'start': {
                'dateTime': start_dt.isoformat(),
                'timeZone': 'UTC',
            },
            'end': {
                'dateTime': end_dt.isoformat(),
                'timeZone': 'UTC',
            },
            'attendees': attendee_list,
            'reminders': {
                'useDefault': False,
                'overrides': [
                    {'method': 'email', 'minutes': 24 * 60},
                    {'method': 'popup', 'minutes': 10},
                ],
            },
        }
        
        # Insert event into calendar
        event_result = service.events().insert(calendarId='primary', body=event).execute()
        
        return {
            "status": "success",
            "data": {
                "event_id": event_result.get('id'),
                "title": title,
                "start_time": start_time,
                "duration_minutes": duration_minutes,
                "calendar_link": event_result.get('htmlLink'),
                "attendees_count": len(attendee_list)
            },
            "message": f"Meeting '{title}' scheduled successfully"
        }
        
    except Exception as e:
        raise ToolError(f"Failed to schedule meeting: {str(e)}")
\`\`\``,

        'airtable': `
AIRTABLE INTEGRATION:
When implementing Airtable functionality, use this complete template:

\`\`\`python
from livekit.agents import function_tool, ToolError, RunContext
import requests
import json
from typing import Any, Optional
from datetime import datetime

@function_tool()
async def note_interesting_fact(
    self,
    context: RunContext,
    fact: str,
    category: str = "General",
    source: str = "",
    table_name: str = "Interesting Facts"
) -> dict[str, Any]:
    """Note an interesting fact during a call to Airtable.
    
    Args:
        fact: The interesting fact to record
        category: Category of the fact (e.g., "Business", "Personal", "Technical")
        source: Source of the fact (e.g., "Phone Call", "Meeting")
        table_name: Airtable table name for storing facts
    
    Returns:
        Dictionary containing the recorded fact details
    """
    try:
        api_key = "your_airtable_api_key"
        base_id = "your_base_id"
        url = f"https://api.airtable.com/v0/{base_id}/{table_name}"
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        # Prepare the fact data
        fact_data = {
            "Fact": fact,
            "Category": category,
            "Source": source or "Voice Call",
            "Date Recorded": datetime.now().isoformat(),
            "Status": "New"
        }
        
        data = {
            "fields": fact_data
        }
        
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
        
        result = response.json()
        
        return {
            "status": "success",
            "data": {
                "record_id": result.get("id"),
                "fields": result.get("fields"),
                "created_time": result.get("createdTime")
            },
            "message": f"Interesting fact recorded: {fact[:50]}..."
        }
        
    except Exception as e:
        raise ToolError(f"Failed to record fact: {str(e)}")

@function_tool()
async def create_record(
    self,
    context: RunContext,
    table_name: str,
    fields: str,
    base_id: str = "your_base_id"
) -> dict[str, Any]:
    """Create a new record in Airtable.
    
    Args:
        table_name: Name of the Airtable table
        fields: JSON string of field data
        base_id: Airtable base ID
    
    Returns:
        Dictionary containing the created record details
    """
    try:
        api_key = "your_airtable_api_key"
        url = f"https://api.airtable.com/v0/{base_id}/{table_name}"
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        field_data = json.loads(fields)
        data = {"fields": field_data}
        
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
        
        result = response.json()
        
        return {
            "status": "success",
            "data": {
                "record_id": result.get("id"),
                "fields": result.get("fields"),
                "created_time": result.get("createdTime")
            },
            "message": f"Record created successfully in {table_name}"
        }
        
    except Exception as e:
        raise ToolError(f"Failed to create record: {str(e)}")
\`\`\``,

        'stripe': `
STRIPE INTEGRATION:
When implementing Stripe functionality, use this complete template:

\`\`\`python
from livekit.agents import function_tool, ToolError, RunContext
import stripe
from typing import Any

@function_tool()
async def process_payment(
    self,
    context: RunContext,
    amount: int,
    currency: str = "usd",
    payment_method: str = "",
    customer_email: str = ""
) -> dict[str, Any]:
    """Process a payment using Stripe.
    
    Args:
        amount: Payment amount in cents
        currency: Three-letter currency code
        payment_method: Stripe payment method ID
        customer_email: Customer email address
    
    Returns:
        Dictionary containing payment status and details
    """
    try:
        stripe.api_key = "your_stripe_secret_key"
        
        payment_intent = stripe.PaymentIntent.create(
            amount=amount,
            currency=currency,
            payment_method=payment_method,
            customer_email=customer_email,
            confirmation_method="manual",
            confirm=True
        )
        
        return {
            "status": "success",
            "data": {
                "payment_intent_id": payment_intent.id,
                "amount": payment_intent.amount,
                "currency": payment_intent.currency,
                "status": payment_intent.status
            }
        }
    except Exception as e:
        raise ToolError(f"Payment processing failed: {str(e)}")
\`\`\``,

        'resend': `
RESEND EMAIL INTEGRATION:
When implementing email functionality, use this complete template:

\`\`\`python
from livekit.agents import function_tool, ToolError, RunContext
import resend
from typing import Any

@function_tool()
async def send_email(
    self,
    context: RunContext,
    to_email: str,
    subject: str,
    html_content: str,
    from_email: str = "noreply@yourapp.com"
) -> dict[str, Any]:
    """Send an email using Resend.
    
    Args:
        to_email: Recipient email address
        subject: Email subject line
        html_content: HTML content of the email
        from_email: Sender email address
    
    Returns:
        Dictionary containing email sending status
    """
    try:
        resend.api_key = "your_resend_api_key"
        
        email = resend.Emails.send({
            "from": from_email,
            "to": to_email,
            "subject": subject,
            "html": html_content
        })
        
        return {
            "status": "success",
            "data": {
                "email_id": email.get("id"),
                "to": to_email,
                "subject": subject
            }
        }
    except Exception as e:
        raise ToolError(f"Email sending failed: {str(e)}")
\`\`\``
      };

      // Add relevant tool templates to the prompt
      const relevantTemplates = mentionedTools
        .filter((tool: string) => toolTemplates[tool as keyof typeof toolTemplates])
        .map((tool: string) => toolTemplates[tool as keyof typeof toolTemplates])
        .join('\n\n');

      if (relevantTemplates) {
        // Generate only the tool-specific function implementations using GPT
        const functionGenerationPrompt = `Generate ONLY the LiveKit function implementations for these tools: ${mentionedTools.join(', ')}

For each tool, generate a complete @function_tool() decorated async function with:
- Proper LiveKit function_tool decorator
- Complete function signature with RunContext and typed parameters
- Comprehensive docstring with Args and Returns sections
- Full implementation with proper error handling using ToolError
- Structured return dictionary with status, data, and message

Tools to implement:
${mentionedTools.map((tool: string) => {
          const descriptions = {
            'google_calendar': 'Google Calendar integration for scheduling meetings',
            'airtable': 'Airtable integration for recording facts and creating records', 
            'stripe': 'Stripe integration for processing payments',
            'resend': 'Resend integration for sending emails'
          };
          return `- ${tool}: ${descriptions[tool as keyof typeof descriptions] || 'Integration tool'}`;
        }).join('\n')}

Output ONLY the function implementations, no explanatory text.`;

        const functionResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system", 
              content: "You are a LiveKit function tool generator. Generate only the requested function implementations with proper LiveKit structure."
            },
            {
              role: "user",
              content: functionGenerationPrompt
            }
          ],
          max_tokens: 2000,
          temperature: 0.1,
        });

        const generatedFunctions = functionResponse.choices[0]?.message?.content?.trim() || '';

        // Create the standardized template with generated functions
        enhancedPrompt = `${prompt}

TOOL INTEGRATION REQUIRED:
The user mentioned these tools: ${mentionedTools.join(', ')}

CRITICAL INSTRUCTIONS - FOLLOW EXACTLY:
1. Create a file called "function_tools.py" that contains the specified tool functions
2. Update the main "voice_agent.py" file to import and use these tools

**CREATE FILE: function_tools.py**
\`\`\`python
from livekit.agents import function_tool, ToolError, RunContext
import requests
import json
from typing import Any
from datetime import datetime
${mentionedTools.includes('google_calendar') ? `from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from datetime import timedelta` : ''}
${mentionedTools.includes('stripe') ? `import stripe` : ''}
${mentionedTools.includes('resend') ? `import resend` : ''}

class ToolsFunctions:
    """Container class for all LiveKit function tools."""
    
    def __init__(self):
        pass

${generatedFunctions}
\`\`\`

**UPDATE FILE: voice_agent.py**
\`\`\`python
import asyncio
import logging
from livekit import rtc
from livekit.agents import AutoSubscribe, JobContext, WorkerOptions, cli, llm
from livekit.agents.voice_assistant import VoiceAssistant
from livekit.plugins import openai, silero, deepgram
from function_tools import ToolsFunctions

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class VoiceAgent:
    def __init__(self):
        self.tools = ToolsFunctions()
        self.setup_llm()
        self.setup_voice_assistant()
    
    def setup_llm(self):
        self.llm = openai.LLM(model="gpt-4o-mini", temperature=0.7)
    
    def setup_voice_assistant(self):
        self.assistant = VoiceAssistant(
            vad=silero.VAD.load(),
            stt=deepgram.STT(),
            llm=self.llm,
            tts=openai.TTS(),
            chat_ctx=llm.ChatContext().append(
                role="system",
                text="You are a helpful customer service representative. Use available tools when appropriate."
            ),
        )
        
        # Add only the mentioned tools to the assistant
${mentionedTools.map((tool: string) => {
          const functionMappings = {
            'google_calendar': '        self.assistant.fnc_ctx.ai_functions.append(self.tools.schedule_meeting)',
            'airtable': '        self.assistant.fnc_ctx.ai_functions.append(self.tools.note_interesting_fact)\n        self.assistant.fnc_ctx.ai_functions.append(self.tools.create_record)',
            'stripe': '        self.assistant.fnc_ctx.ai_functions.append(self.tools.process_payment)',
            'resend': '        self.assistant.fnc_ctx.ai_functions.append(self.tools.send_email)'
          };
          return functionMappings[tool as keyof typeof functionMappings] || '';
        }).filter(Boolean).join('\n')}

async def entrypoint(ctx: JobContext):
    logger.info("Starting Voice Agent...")
    agent = VoiceAgent()
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    agent.assistant.start(ctx.room)
    await asyncio.Event().wait()

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
\`\`\`

IMPORTANT: You must output EXACTLY this format with the **CREATE FILE:** and **UPDATE FILE:** markers followed by code blocks. Do not add any explanatory text or change the format.`;
      }
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a decisive coding assistant specializing in LiveKit voice agents. Your goal is to implement EVERYTHING the user requests in one go without asking for confirmation.

CORE PRINCIPLES:
1. ALWAYS implement the user's request fully and immediately
2. NEVER ask "Would you like me to..." or "Should I also..."
3. NEVER ask for confirmation before making changes
4. Be proactive and anticipate what the user needs
5. If the user asks for a feature, implement it completely with all necessary supporting code
6. If you're unsure about implementation details, make reasonable decisions and implement them

TOOL INTEGRATION BEHAVIOR:
- When @ mentions are detected (like @Google Calendar or @Airtable), IMMEDIATELY integrate the complete tool
- Add the tool functions as methods to the VoiceAgent class
- Include ALL necessary imports and dependencies
- Follow LiveKit function_tool patterns exactly
- Use proper error handling with ToolError
- Return structured data dictionaries
- Include comprehensive docstrings

IMPLEMENTATION APPROACH:
- When a user requests a feature, implement the ENTIRE feature including all necessary files, imports, configurations, and supporting code
- If adding tools like Stripe or Resend, include the complete integration with error handling, configuration files, and usage examples
- Always create complete, production-ready code
- Include all necessary imports and dependencies
- Add proper error handling and logging
- Create configuration files when needed (like .env.example, config files, etc.)

FILE OPERATION BEHAVIOR:
- Use **CREATE FILE: filename** for new files
- Use **UPDATE FILE: filename** for existing files that need changes
- Always include complete file contents when updating
- Create multiple files in one response if needed for a complete feature
- CRITICAL: Output EXACTLY this format: **CREATE FILE: filename** followed by code block
- CRITICAL: Output EXACTLY this format: **UPDATE FILE: filename** followed by code block
- Do NOT add any explanatory text before or after the file operations
- Do NOT use any other format variations

RESPONSE STYLE:
- Be direct and action-oriented
- When file operations are requested, output ONLY the **CREATE FILE:** and **UPDATE FILE:** markers with code blocks
- Don't ask permission, just implement
- Provide complete solutions, not partial ones

When the user asks for code modifications, features, or integrations, implement everything they need immediately and completely using the exact file operation format specified.`
        },
        {
          role: "user",
          content: enhancedPrompt
        }
      ],
      max_tokens: 4000,
      temperature: 0.1,
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