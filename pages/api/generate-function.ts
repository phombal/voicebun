import { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const FUNCTION_GENERATION_PROMPT = `Generate function configurations for voice agents. Respond with ONLY a valid JSON array.

IMPORTANT: If you need API documentation to create accurate functions, respond with:
{
  "request_documentation": true,
  "service": "service_name",
  "message": "Please provide the API documentation for [service] so I can generate accurate function configurations. Include endpoints, authentication methods, and request/response examples."
}

For API functions with documentation provided:
{
  "name": "descriptive_function_name",
  "description": "Clear description of what this function does",
  "url": "https://api.service.com/v1/endpoint",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer {{api_key}}",
    "User-Agent": "VoiceAgent/1.0"
  },
  "body": {
    "field1": "{{parameter1}}",
    "field2": "{{parameter2}}",
    "timestamp": "{{current_time}}"
  },
  "parameters": {
    "type": "object",
    "required": ["api_key", "parameter1"],
    "properties": {
      "api_key": {
        "type": "string",
        "description": "API authentication key"
      },
      "parameter1": {
        "type": "string", 
        "description": "Required parameter description"
      },
      "parameter2": {
        "type": "string",
        "description": "Optional parameter description",
        "default": "default_value"
      }
    }
  }
}

For voice functions (hangup, voicemail):
{
  "name": "function_name",
  "description": "Description",
  "parameters": {
    "type": "object",
    "required": [],
    "properties": {}
  }
}

Requirements:
- Request documentation for unfamiliar APIs
- Use exact endpoint URLs from documentation
- Match authentication methods from docs
- Create request bodies based on API specs
- Use {{template_variables}} for dynamic values
- Include required and optional parameters from docs

Known APIs (no docs needed): Cal.com, Google Sheets basic, Zapier webhooks, Slack webhooks, Discord webhooks.

ONLY return valid JSON array OR documentation request object.`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('🚀 Function generation API called');
  console.log('📝 Request method:', req.method);
  console.log('📋 Request body:', JSON.stringify(req.body, null, 2));
  
  if (req.method !== 'POST') {
    console.log('❌ Invalid method:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, projectId } = req.body;
    console.log('📊 Extracted data:', { 
      promptLength: prompt?.length || 0, 
      projectId: projectId || 'undefined',
      hasPrompt: !!prompt 
    });

    if (!prompt) {
      console.log('❌ No prompt provided');
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log('🔑 Checking Anthropic API key...');
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
    console.log('🔑 API key status:', hasApiKey ? 'present' : 'missing');
    
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('❌ Anthropic API key not configured');
      return res.status(500).json({ error: 'Anthropic API key not configured' });
    }

    console.log('🤖 Making Anthropic API call...');
    console.log('📝 Prompt preview:', prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''));
    
    const apiCallStart = Date.now();
    let message;
    
    try {
      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        temperature: 0.3,
        system: FUNCTION_GENERATION_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Generate function(s) for: ${prompt}`
          }
        ]
      });
      
      const apiCallDuration = Date.now() - apiCallStart;
      console.log('✅ Anthropic API call successful');
      console.log('⏱️ API call duration:', apiCallDuration + 'ms');
      console.log('📊 Response structure:', {
        contentCount: message.content?.length || 0,
        usage: message.usage,
        model: message.model,
        role: message.role
      });
      
    } catch (apiError) {
      const apiCallDuration = Date.now() - apiCallStart;
      console.error('❌ Anthropic API call failed');
      console.error('⏱️ Failed API call duration:', apiCallDuration + 'ms');
      console.error('🔥 API Error details:', {
        name: apiError instanceof Error ? apiError.name : 'Unknown',
        message: apiError instanceof Error ? apiError.message : 'Unknown error',
        stack: apiError instanceof Error ? apiError.stack : 'No stack trace'
      });
      
      if (apiError instanceof Error && apiError.message.includes('API key')) {
        return res.status(401).json({ error: 'Invalid Anthropic API key' });
      }
      
      if (apiError instanceof Error && apiError.message.includes('429')) {
        return res.status(429).json({ 
          error: 'Rate limit exceeded. Please wait a moment and try again.',
          details: 'Anthropic API rate limit reached'
        });
      }
      
      throw apiError; // Re-throw to be caught by outer catch
    }

    console.log('🔍 Processing API response...');
    
    // Extract the response content - handle both text and server_tool_use
    let responseText = '';
    
    for (const content of message.content) {
      console.log('📋 Processing content type:', content.type);
      
      if (content.type === 'text') {
        responseText += content.text;
        console.log('📝 Added text content, length:', content.text.length);
      } else if (content.type === 'server_tool_use') {
        // For server_tool_use, look for the actual response in the content
        console.log('🔧 Processing server_tool_use content');
        if (content.result && typeof content.result === 'string') {
          responseText += content.result;
          console.log('📝 Added server_tool_use result, length:', content.result.length);
        }
      }
    }
    
    console.log('📝 Total response text length:', responseText.length);
    console.log('📝 Response text preview:', responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''));
    
    if (!responseText) {
      console.log('❌ No usable response text from Claude');
      return res.status(500).json({ error: 'No usable response from Claude' });
    }

    console.log('🔧 Parsing JSON response...');
    
    // Try to parse the response as JSON
    let functions;
    let cleanedResponse: string; // Declare cleanedResponse at the right scope
    try {
      // More robust JSON extraction - look for JSON blocks
      cleanedResponse = responseText;
      console.log('📝 Original response length:', responseText.length);
      
      // First try to find JSON in code blocks
      const jsonBlockMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
      if (jsonBlockMatch) {
        cleanedResponse = jsonBlockMatch[1];
        console.log('✅ Found JSON in code block, extracted length:', cleanedResponse.length);
      } else {
        console.log('❌ No JSON code block found, trying array pattern...');
        
        // Look for array patterns in the text
        const arrayMatch = responseText.match(/\[\s*\{[\s\S]*?\}\s*\]/);
        if (arrayMatch) {
          cleanedResponse = arrayMatch[0];
          console.log('✅ Found array pattern, extracted length:', cleanedResponse.length);
        } else {
          console.log('❌ No array pattern found, trying object pattern...');
          
          // Look for single object patterns
          const objectMatch = responseText.match(/\{\s*"name"[\s\S]*?\}/);
          if (objectMatch) {
            cleanedResponse = objectMatch[0];
            console.log('✅ Found object pattern, extracted length:', cleanedResponse.length);
          } else {
            console.log('❌ No object pattern found, using fallback cleanup...');
            
            // Fallback: remove markdown and extra text
            cleanedResponse = responseText
              .replace(/```json\n?|\n?```/g, '')
              .replace(/^[^[{]*/, '') // Remove text before first [ or {
              .replace(/[^}\]]*$/, '') // Remove text after last } or ]
              .trim();
            console.log('⚠️ Fallback cleanup, final length:', cleanedResponse.length);
          }
        }
      }
      
      console.log('📝 Cleaned response preview:', cleanedResponse.substring(0, 300) + (cleanedResponse.length > 300 ? '...' : ''));
      
      const parseStart = Date.now();
      functions = JSON.parse(cleanedResponse);
      const parseDuration = Date.now() - parseStart;
      
      console.log('✅ JSON parsing successful');
      console.log('⏱️ Parse duration:', parseDuration + 'ms');
      console.log('📊 Parsed result type:', Array.isArray(functions) ? 'array' : typeof functions);
      console.log('📊 Functions count:', Array.isArray(functions) ? functions.length : 1);
      
      // Check if this is a documentation request
      if (functions && typeof functions === 'object' && functions.request_documentation) {
        console.log('📚 Documentation request detected');
        console.log('🔍 Service:', functions.service);
        console.log('💬 Message:', functions.message);
        
        return res.status(200).json({
          request_documentation: true,
          service: functions.service,
          message: functions.message,
          instructions: "Please provide the API documentation for this service and resubmit your request."
        });
      }
      
      // Ensure it's an array
      if (!Array.isArray(functions)) {
        console.log('🔄 Converting single function to array');
        functions = [functions];
      }
      
    } catch (parseError) {
      console.error('❌ JSON parsing failed');
      console.error('🔥 Parse error details:', {
        name: parseError instanceof Error ? parseError.name : 'Unknown',
        message: parseError instanceof Error ? parseError.message : 'Unknown error',
        responseText: responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''),
        cleanedResponse: cleanedResponse?.substring(0, 500) + (cleanedResponse?.length > 500 ? '...' : '')
      });
      
      return res.status(500).json({ 
        error: 'Failed to parse function configuration',
        details: parseError instanceof Error ? parseError.message : 'Unknown parsing error',
        rawResponse: responseText.substring(0, 1000) // Limit raw response size in error
      });
    }

    console.log('✅ Starting function validation...');
    
    // Validate the function structure
    const validatedFunctions = functions.map((func: any, index: number) => {
      console.log(`🔍 Validating function ${index + 1}:`, func.name || 'unnamed');
      
      // Ensure required fields
      if (!func.name || !func.description || !func.parameters) {
        console.error(`❌ Function ${index + 1} missing required fields:`, {
          hasName: !!func.name,
          hasDescription: !!func.description,
          hasParameters: !!func.parameters,
          actualFunc: func
        });
        throw new Error(`Invalid function structure: missing required fields in function ${index + 1}`);
      }

      // Add default HTTP method for API functions
      if (func.url && !func.method) {
        console.log(`🔧 Adding default method POST to function: ${func.name}`);
        func.method = 'POST';
      }

      // Ensure parameters has the correct structure
      if (!func.parameters.type) {
        console.log(`🔧 Adding default type 'object' to function: ${func.name}`);
        func.parameters.type = 'object';
      }
      if (!func.parameters.properties) {
        console.log(`🔧 Adding empty properties to function: ${func.name}`);
        func.parameters.properties = {};
      }
      if (!func.parameters.required) {
        console.log(`🔧 Adding empty required array to function: ${func.name}`);
        func.parameters.required = [];
      }

      console.log(`✅ Function ${index + 1} validated successfully:`, func.name);
      return func;
    });

    console.log('🎉 All functions validated successfully');
    console.log('📊 Final result:', {
      functionCount: validatedFunctions.length,
      functionNames: validatedFunctions.map(f => f.name)
    });

    const responsePayload = {
      functions: validatedFunctions,
      message: `Generated ${validatedFunctions.length} function(s) successfully`
    };
    
    console.log('📤 Sending successful response');
    return res.status(200).json(responsePayload);

  } catch (error) {
    console.error('🚨 CRITICAL ERROR in function generation');
    console.error('🔥 Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      errorType: error?.constructor?.name || 'Unknown type'
    });
    
    // Additional error context
    console.error('📋 Request context when error occurred:', {
      method: req.method,
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      userAgent: req.headers['user-agent'],
      contentType: req.headers['content-type']
    });
    
    return res.status(500).json({ 
      error: 'Failed to generate function',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
} 