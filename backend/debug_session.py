"""Debug script: inspect session data and test pipeline components."""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def run():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['hirenet_ai']

    # Get the most recent session
    sessions = await db['sessions'].find().sort('_id', -1).limit(1).to_list(1)
    if not sessions:
        print('No sessions found.')
        return

    session = sessions[0]
    print(f"Session ID: {session['_id']}")
    print(f"Status: {session.get('status')}")
    print(f"Final score: {session.get('final_score')}")
    print(f"Answers count: {len(session.get('answers', []))}")
    print()

    for i, ans in enumerate(session.get('answers', [])[:3]):  # show first 3
        print(f"--- Answer {i+1} ---")
        print(f"  question_id:       {ans.get('question_id')}")
        print(f"  processed:         {ans.get('processed')}")
        print(f"  transcript:        {repr(ans.get('transcript', ''))[:120]}")
        print(f"  answer_final_score:{ans.get('answer_final_score')}")
        print(f"  confidence_index:  {ans.get('confidence_index')}")
        print(f"  hesitation_score:  {ans.get('hesitation_score')}")
        llm = ans.get('llm_evaluation')
        if llm:
            print(f"  llm.overall_score: {llm.get('overall_score')}")
            print(f"  llm.reasoning:     {llm.get('reasoning', '')[:120]}")
        else:
            print(f"  llm_evaluation:    NONE/MISSING")
        print()

    client.close()

asyncio.run(run())
