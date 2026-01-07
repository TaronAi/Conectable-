import { GoogleGenAI, Chat } from "@google/genai";

let chatSession: Chat | null = null;

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API_KEY is missing from environment variables");
    throw new Error("API Key missing");
  }
  return new GoogleGenAI({ apiKey });
};

export const initChat = (systemInstruction: string = "You are a helpful meeting assistant. Keep responses concise and relevant to a video call context.") => {
  const ai = getClient();
  chatSession = ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction,
    },
  });
};

export const sendMessageToGemini = async function* (message: string) {
  if (!chatSession) {
    initChat();
  }
  if (!chatSession) throw new Error("Failed to initialize chat");

  try {
    const stream = await chatSession.sendMessageStream({ message });
    for await (const chunk of stream) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  } catch (error) {
    console.error("Gemini API Error:", error);
    yield "I'm having trouble connecting right now. Please try again.";
  }
};
