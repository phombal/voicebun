import asyncio
import logging
from typing import Annotated

from livekit import rtc
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
    llm,
)
from livekit.agents.voice_assistant import VoiceAssistant
from livekit.plugins import google, silero

logger = logging.getLogger("voice-assistant")

def prewarm_process(proc: JobProcess):
    """Preload models to reduce startup time"""
    proc.userdata["vad"] = silero.VAD.load()

async def entrypoint(ctx: JobContext):
    initial_ctx = llm.ChatContext().append(
        role="system",
        text=(
            "You are a helpful healthcare assistant that provides wellness tips and reminders. "
            "Your knowledge includes nutrition advice, exercise recommendations, mental health tips, "
            "and general wellness guidance. Always provide supportive and encouraging responses. "
            "If asked about serious medical conditions, remind users to consult with healthcare professionals. "
            "Keep your responses concise and conversational for voice interaction."
        ),
    )

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Use Google Gemini instead of OpenAI
    assistant = VoiceAssistant(
        vad=ctx.proc.userdata["vad"],
        stt=google.STT(),
        llm=google.LLM(model="gemini-2.0-flash-exp"),  # Using Gemini 2.0
        tts=google.TTS(),
        chat_ctx=initial_ctx,
    )

    assistant.start(ctx.room)

    await asyncio.sleep(1)
    await assistant.say("Hello! I'm your healthcare wellness assistant. How can I help you stay healthy today?", allow_interruptions=True)

if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm_process,
        ),
    ) 