# LiveKit Dynamic Agent Setup Guide

This guide walks you through setting up the dynamic LiveKit voice agent that automatically fetches project configurations and adapts behavior in real-time.

## Overview

The integration consists of:
- **Dynamic Agent** (`agent/` folder): Python LiveKit agent that fetches configurations from Supabase
- **Frontend Integration**: Modified Test button to connect users to project-specific rooms
- **Configuration Management**: Automatic mapping of UI settings to agent parameters

## 🚀 Quick Start

### 1. Set Up LiveKit Cloud Account

1. Go to [LiveKit Cloud](https://cloud.livekit.io/) and create a free account
2. Create a new project
3. Note down your API credentials from the project settings:
   - API Key
   - API Secret
   - WebSocket URL (e.g., `wss://your-project.livekit.cloud`)

### 2. Get AI Provider API Keys

You'll need API keys for the AI services. Choose one approach:

**Option A: STT-LLM-TTS Pipeline (Recommended)**
- [OpenAI API Key](https://platform.openai.com/api-keys) (for LLM)
- [Deepgram API Key](https://console.deepgram.com/) (for STT)
- [Cartesia API Key](https://cartesia.ai) (for TTS)

**Option B: OpenAI Realtime Model**
- [OpenAI API Key](https://platform.openai.com/api-keys) (handles everything)

### 3. Install Agent Dependencies

```bash
cd agent
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Configure Environment Variables

Copy the example file and edit with your credentials:
```bash
cd agent
cp env.example .env
```

Then edit `agent/.env` with your actual values:

```bash
# LiveKit Configuration
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_URL=wss://your-project-name.livekit.cloud

# AI Provider API Keys
OPENAI_API_KEY=your_openai_api_key
DEEPGRAM_API_KEY=your_deepgram_api_key
CARTESIA_API_KEY=your_cartesia_api_key

# Database Configuration (same as your main app)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Agent Configuration
AGENT_NAME=voice-agent-worker
```

### 5. Test Your Setup

```bash
cd agent
python test_agent.py
```

This will verify all dependencies and connections are working.

### 6. Download Model Files

```bash
python dynamic_agent.py download-files
```

### 7. Start the Agent

For development:
```bash
python dynamic_agent.py dev
```

For production:
```bash
python dynamic_agent.py start
```

You should see output like:
```
INFO: Agent starting...
INFO: Connected to LiveKit server
INFO: Worker ready to accept jobs
```

### 8. Test from Frontend

1. Start your Next.js app: `npm run dev`
2. Go to a project and configure your voice agent
3. Click "Save Configuration" to save settings
4. Click "Test" - you should connect to the agent with your configuration

## 🔧 How It Works

### Architecture Flow

```
User clicks Test → LiveKit Room (project-id) → Dynamic Agent → Fetches Config from Supabase → Adapts Behavior
```

### Configuration Mapping

The agent automatically maps your UI settings to LiveKit parameters:

| UI Setting | Agent Parameter | Example |
|------------|----------------|---------|
| System Prompt | Agent Instructions | "You are a customer service rep..." |
| LLM Model | OpenAI Model | `gpt-4o-mini` |
| TTS Voice | Voice Selection | `nova`, `alloy`, etc. |
| STT Language | Language Model | `en`, `es`, `fr`, etc. |
| Speaking Speed | TTS Speed | `0.8`, `1.0`, `1.2` |

### Real-time Configuration

- Agent fetches latest config when user connects
- Configurations are cached for performance
- Changes in UI are immediately available for new conversations

## 🛠 Customization

### Adding New AI Providers

1. Install the provider plugin: `pip install livekit-plugins-newprovider`
2. Add configuration mapping in `config.py`
3. Add provider creation logic in `dynamic_agent.py`

### Extending Configuration

1. Add new fields to `ProjectConfig` model in `config.py`
2. Update configuration mapping functions
3. Use new settings in agent creation

### Custom Agent Behavior

Modify the `DynamicAssistant` class in `dynamic_agent.py` to add:
- Function calling
- RAG document integration
- Custom conversation flows
- Analytics and logging

## 📊 Monitoring and Debugging

### Agent Logs

The agent provides detailed logging:
```bash
INFO: Agent starting for room: project-abc-123
INFO: Fetching configuration for project: project-abc-123
INFO: Loaded configuration - LLM: openai/gpt-4o-mini, STT: deepgram, TTS: openai/nova
INFO: Agent successfully initialized
```

### Frontend Debug Info

Check browser console for connection details:
```javascript
📡 Fetching connection details from: /api/connection-details?projectId=abc-123
✅ Connected to room successfully
👥 Participants after wait: 1
```

### Common Issues

**Agent not connecting:**
- Check LiveKit credentials in `.env`
- Verify agent is running: `python dynamic_agent.py dev`
- Check firewall/network settings

**Configuration not loading:**
- Verify Supabase credentials
- Check that project_data table exists
- Ensure project has saved configuration

**Audio issues:**
- Check microphone permissions in browser
- Verify AI provider API keys
- Test with different browsers

## 🚀 Production Deployment

### Agent Deployment

**Option 1: Docker**
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY agent/ .
RUN pip install -r requirements.txt
CMD ["python", "dynamic_agent.py", "start"]
```

**Option 2: Process Manager**
```bash
# Using PM2
pm2 start "python dynamic_agent.py start" --name voice-agent
```

**Option 3: Cloud Deployment**
- Deploy to AWS ECS, Google Cloud Run, or similar
- Ensure environment variables are properly configured
- Use health checks: agent provides `/health` endpoint

### Scaling

For high traffic:
- Increase `num_idle_workers` in `dynamic_agent.py`
- Deploy multiple agent instances
- Use load balancing for LiveKit servers

### Security

- Use service role keys for Supabase (not user keys)
- Implement rate limiting on connection endpoint
- Monitor agent logs for suspicious activity
- Rotate API keys regularly

## 🎯 Next Steps

Once basic setup is working:

1. **Function Calling**: Add custom tools and integrations
2. **RAG Integration**: Connect to knowledge bases
3. **Webhooks**: Send conversation events to external systems
4. **Analytics**: Track conversation metrics and performance
5. **Multi-language**: Support multiple languages and accents
6. **Custom Voices**: Train custom voice models

## 📚 Additional Resources

- [LiveKit Agents Documentation](https://docs.livekit.io/agents/)
- [LiveKit Cloud Console](https://cloud.livekit.io/)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Deepgram API Documentation](https://developers.deepgram.com/)
- [Cartesia API Documentation](https://docs.cartesia.ai/)

## 🆘 Support

If you encounter issues:

1. Run the test script: `python agent/test_agent.py`
2. Check agent logs for error messages
3. Verify all environment variables are set correctly
4. Test with minimal configuration first

The agent is designed to be robust and provide clear error messages to help with debugging. 