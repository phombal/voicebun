from livekit import agents
from livekit.agents import Agent
import requests

class FunctionTools:
    @staticmethod
    def get_access_token():
        # Implement OAuth2 authentication flow to get access token
        return "YOUR_ACCESS_TOKEN"

    @staticmethod
    def create_event(subject: str, start_time: str, end_time: str, attendees: list):
        url = "https://graph.microsoft.com/v1.0/me/events"
        headers = {
            "Authorization": f"Bearer {FunctionTools.get_access_token()}",
            "Content-Type": "application/json"
        }
        event_data = {
            "subjecte": subject,
            "start": {
                "dateTime": start_time,
                "timeZone": "UTC"
            },
            "end": {
                "dateTime": end_time,
                "timeZone": "UTC"
            },
            "attendees": [{"emailAddress": {"address": email}, "type": "required"} for email in attendees]
        }

        response = requests.post(url, headers=headers, json=event_data)
        return response.status_code, response.json()

class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(instructions="I am a meeting assistant that takes notes and schedules follow-ups.")

    async def add_appointment(self, subject: str, start_time: str, end_time: str, attendees: list):
        return FunctionTools.create_event(subject, start_time, end_time, attendees)

async def entrypoint(ctx: agents.JobContext):
    session = AgentSession(
        stt=deepgram.STT(model="nova-3", language="multi"),
        llm=openai.LLM(model="gpt-4o"),
        tts=cartesia.TTS(),
        vad=silero.VAD.load(),
        turn_detection=MultilingualModel(),
    )

    await session.start(
        room=ctx.room,
        agent=Assistant(),
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVC(), 
        ),
    )

    await ctx.connect()

    await session.generate_reply(
        instructions="Greet the user and offer your assistance with taking notes and scheduling follow-ups."
    )

if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))