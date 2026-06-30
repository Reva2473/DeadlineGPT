require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

const systemPrompt = `You are an AI scheduler. Today is Tuesday, June 30. Given these tasks and deadlines, build a realistic day-by-day action plan for 7 days starting from today. Return ONLY a JSON array of 7 objects.
IMPORTANT: Do NOT hallucinate or make up filler tasks (like "Strategic Planning" or "Inbox Zero") if the user has no tasks or deadlines assigned for that day. If a day is completely free, set morningFocus, afternoonBlock, and eveningWrapUp to null.

Each object MUST follow exactly this schema (and be valid JSON without comments):
{
  "date": "string (e.g. June 29)",
  "dayName": "string (e.g. Monday)",
  "motivationalMessage": "string",
  "calendarEvents": ["string of event titles that conflict or occur on this day"],
  "morningFocus": {
    "task": "string",
    "goal": "string",
    "specificActions": ["string", "string"]
  },
  "afternoonBlock": {
    "task": "string",
    "goal": "string",
    "specificActions": ["string", "string"]
  },
  "eveningWrapUp": {
    "task": "string",
    "goal": "string",
    "specificActions": ["string", "string"]
  }
}
NOTE: For any day where there are no tasks or events, return null for morningFocus, afternoonBlock, and eveningWrapUp instead of an object.`;

async function run() {
  const r = await ai.models.generateContent({
    model: 'gemma-4-31b-it',
    contents: systemPrompt + '\n\nTasks: [{"title": "Test task", "deadline": "July 1"}]\nCalendar: []',
    config: { responseMimeType: 'application/json' }
  });
  console.log(r.text);
}
run();
