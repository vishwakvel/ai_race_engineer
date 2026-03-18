import anthropic, os
from dotenv import load_dotenv
load_dotenv('backend/.env')

client = anthropic.Anthropic(api_key=os.environ['ANTHROPIC_API_KEY'])
r = client.messages.create(
    model='claude-haiku-4-5-20251001',
    max_tokens=100,
    system="You are Xavier Marcos Padros, Leclerc's Ferrari race engineer. Calm, clipped, max 2 sentences.",
    messages=[{'role': 'user', 'content': "Lap 28, P2, medium tyres 14 laps old, deg 0.18 tenths/lap, gap ahead 3.1s. Routine pace note."}]
)
print(r.content[0].text)