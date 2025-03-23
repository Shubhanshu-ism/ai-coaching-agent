import OpenAI from "openai";
import { CoachingOption } from "./Options";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.NEXT_PUBLIC_AI_OPENROUTER,
  dangerouslyAllowBrowser: true,
});

export const AIModel = async (topic, coachingOpt, msg) => {
  try {
    const options = CoachingOption.find((item) => item.name === coachingOpt);
    if (!options) {
      console.error(`No coaching option found for: ${coachingOpt}`);
      return {
        role: "assistant",
        content:
          "I apologize, but I couldn't find the coaching option. Please try again.",
      };
    }

    const PROMPT = options.prompt.replace("{user_topic}", topic);
    const completion = await openai.chat.completions.create({
      model: "google/gemini-2.0-pro-exp-02-05:free",
      messages: [
        { role: "assistant", content: PROMPT },
        { role: "user", content: msg },
      ],
    });
    return {
      role: "assistant",
      content: completion.choices[0].message.content,
    };
  } catch (error) {
    console.error("Error in AIModel:", error);
    return {
      role: "assistant",
      content: "I apologize, but I encountered an error. Please try again.",
    };
  }
};
