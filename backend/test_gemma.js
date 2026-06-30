require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

const systemPrompt = `You are an autonomous AI life manager. Analyze these emails... Use exactly this JSON schema: { "overallStressLevel": 5, "emailsNeedingReply": [] }`;

async function run() {
  try {
    const r = await ai.models.generateContent({
      model: 'gemma-4-31b-it',
      contents: systemPrompt + '\n\nDATA:\nEmails: []',
      config: { responseMimeType: 'application/json' }
    });
    console.log(r.text);
  } catch (e) {
    console.error("API ERROR:", e.message);
  }
}
run();
