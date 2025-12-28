
import { GoogleGenAI, Type } from "@google/genai";
import { Prompt } from "../types";

export const generatePrompts = async (count: number): Promise<Prompt[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a list of ${count} creative drawing prompts for a "Sketch it!" party game. 
      IMPORTANT: Provide an equal mix of 'easy', 'medium', and 'hard' difficulties.
      Categories should include: Animals, Pop Culture, Everyday Objects, Actions, Food, Landmarks, and Abstract Concepts.
      Ensure words are distinct and fun to draw.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              word: { type: Type.STRING },
              category: { type: Type.STRING },
              difficulty: { type: Type.STRING, enum: ['easy', 'medium', 'hard'] }
            },
            required: ['word', 'category', 'difficulty']
          }
        }
      }
    });

    const jsonStr = response.text.trim();
    return JSON.parse(jsonStr) as Prompt[];
  } catch (error) {
    console.error("Failed to generate prompts via Gemini:", error);
    // Comprehensive fallback with varying difficulties
    return [
      { word: "Cat", category: "Animals", difficulty: "easy" },
      { word: "Pizza", category: "Food", difficulty: "easy" },
      { word: "House", category: "Objects", difficulty: "easy" },
      { word: "Skateboarding", category: "Action", difficulty: "medium" },
      { word: "Eiffel Tower", category: "Landmark", difficulty: "medium" },
      { word: "Library", category: "Places", difficulty: "medium" },
      { word: "Gravity", category: "Abstract", difficulty: "hard" },
      { word: "Internet", category: "Technology", difficulty: "hard" },
      { word: "Metamorphosis", category: "Biology", difficulty: "hard" }
    ];
  }
};
