import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.NEXT_PUBLIC_AI_OPENROUTER,
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "AI Coaching Agent",
  },
});

export async function POST(req) {
  // Add a unique request ID for tracking
  const requestId = Date.now().toString();

  try {
    // Validate request body first
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error(`[${requestId}] Invalid JSON in request:`, parseError);
      return NextResponse.json(
        {
          role: "assistant",
          content:
            "I apologize, but I received an invalid request format. Please try again.",
          error: "Invalid request format",
          details: "The request body could not be parsed as JSON.",
        },
        { status: 400 }
      );
    }

    const { topic, coachingOpt, msg } = requestBody;

    // Validate required fields
    if (!topic || !coachingOpt || !msg) {
      console.error(`[${requestId}] Missing required fields in request:`, {
        topic,
        coachingOpt: coachingOpt?.name,
        msgCount: msg?.length,
      });
      return NextResponse.json(
        {
          role: "assistant",
          content:
            "I apologize, but some required information is missing. Please try again.",
          error: "Missing required fields",
          details:
            "Topic, coaching option, or messages are missing from the request.",
        },
        { status: 400 }
      );
    }

    if (!process.env.NEXT_PUBLIC_AI_OPENROUTER) {
      console.error(`[${requestId}] OpenRouter API key is not configured`);
      return NextResponse.json(
        {
          role: "assistant",
          content:
            "I apologize, but the AI service is not properly configured. Please try again later.",
          error: "API key not configured",
          details:
            "The OpenRouter API key is missing from the environment variables.",
        },
        { status: 500 }
      );
    }

    console.log(`[${requestId}] Sending request to OpenRouter with:`, {
      topic,
      coachingOpt: coachingOpt.name,
      msgCount: msg.length,
      apiKey: process.env.NEXT_PUBLIC_AI_OPENROUTER ? "Configured" : "Missing",
    });

    const messages = [
      {
        role: "system",
        content: `${coachingOpt.prompt.replace("{user_topic}", topic)}\n\nIMPORTANT ADDITIONAL INSTRUCTIONS:\n1. For technical topics like programming, databases, math, or science, begin with extremely basic concepts and simple analogies\n2. If the user says anything indicating they are a beginner (like "I don't know much", "I'm new to this", "I know very little"), immediately switch to the most basic explanations\n3. Prioritize helping the user understand core concepts before introducing technical details\n4. Each response should be unique and directly address what the user just said\n5. Never use academic or complex language without immediately explaining it in simple terms\n6. For brief or unclear user responses, assume they may need more help and offer a clearer explanation\n7. Be exceptionally patient and encouraging with beginners - remind them that complex topics take time to understand\n8. For technical subjects like DBMS, programming, math, or science, use real-life examples that anyone can relate to`,
      },
      ...msg,
    ];

    console.log(`[${requestId}] Messages being sent:`, messages);

    try {
      console.log(
        `[${requestId}] Starting API request with ${messages.length} messages`
      );

      // Set a timeout for the OpenAI call
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("OpenAI API request timeout")), 25000)
      );

      // Create the completion promise
      const completionPromise = openai.chat.completions.create({
        model: "anthropic/claude-3-haiku:official",
        messages,
        temperature: 0.7,
        max_tokens: 300,
        presence_penalty: 0.6,
        frequency_penalty: 0.6,
        timeout: 20000,
      });

      // Race the completion against the timeout
      const completion = await Promise.race([
        completionPromise,
        timeoutPromise,
      ]);

      console.log(
        `[${requestId}] API request completed successfully:`,
        JSON.stringify(completion).substring(0, 200) + "..."
      );

      if (!completion) {
        console.error(`[${requestId}] Null completion object`);
        return NextResponse.json(
          {
            role: "assistant",
            content:
              "I apologize, but I couldn't process your request right now. Let's try again with a simpler question.",
            error: "Null completion object",
            details: "The AI model returned a null response.",
          },
          { status: 500 }
        );
      }

      console.log(
        `[${requestId}] Completion structure:`,
        Object.keys(completion)
      );

      if (
        !completion.choices ||
        !Array.isArray(completion.choices) ||
        completion.choices.length === 0
      ) {
        console.error(
          `[${requestId}] Invalid completion structure:`,
          completion
        );
        return NextResponse.json(
          {
            role: "assistant",
            content:
              "I apologize, but the AI service is experiencing issues. Please try again in a moment.",
            error: "Invalid completion structure",
            details: "The AI model returned an invalid response structure.",
          },
          { status: 500 }
        );
      }

      if (!completion.choices[0]?.message?.content) {
        console.error(
          `[${requestId}] Missing content in completion:`,
          completion
        );
        return NextResponse.json(
          {
            role: "assistant",
            content:
              "I apologize, but I didn't receive a valid response from the AI model. Let's try again with a different question.",
            error: "Invalid response from AI model",
            details: "The AI model returned an empty or invalid response.",
          },
          { status: 500 }
        );
      }

      const responseContent = completion.choices[0].message.content.trim();

      if (responseContent === "") {
        console.error(`[${requestId}] Empty string after trimming`);
        return NextResponse.json(
          {
            role: "assistant",
            content:
              "I apologize, but I received an empty response. Could you please rephrase your question?",
            error: "Empty response",
            details: "The AI model returned an empty string after trimming.",
          },
          { status: 500 }
        );
      }

      // Log successful response
      console.log(
        `[${requestId}] Successful response:`,
        responseContent.substring(0, 50) + "..."
      );

      return NextResponse.json({
        role: "assistant",
        content: responseContent,
      });
    } catch (openaiError) {
      console.error(`[${requestId}] OpenAI API Error:`, openaiError);

      // Additional logging for more detail
      if (openaiError.response) {
        console.error(`[${requestId}] OpenAI Error Details:`, {
          status: openaiError.response.status,
          statusText: openaiError.response.statusText,
          data: openaiError.response.data,
        });
      }

      if (openaiError.message && openaiError.message.includes("timeout")) {
        return NextResponse.json(
          {
            role: "assistant",
            content:
              "I apologize, but the AI service is taking too long to respond. Please try again in a moment.",
            error: "Request timeout",
            details: "The request to the OpenRouter API timed out.",
          },
          { status: 504 }
        );
      }

      if (openaiError.response?.status === 401) {
        return NextResponse.json(
          {
            role: "assistant",
            content:
              "I apologize, but there's an authentication issue with the AI service. Please try again later.",
            error: "Authentication failed",
            details: "The OpenRouter API key is invalid or has expired.",
          },
          { status: 401 }
        );
      }

      if (openaiError.response?.status === 429) {
        return NextResponse.json(
          {
            role: "assistant",
            content:
              "I apologize, but the AI service is currently busy. Please try again in a moment.",
            error: "Rate limit exceeded",
            details: "Too many requests to the OpenRouter API.",
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        {
          role: "assistant",
          content:
            "I apologize, but I encountered an error with the AI service. Please try again.",
          error: "OpenAI API Error",
          details:
            openaiError.message ||
            "An unknown error occurred with the AI service.",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error(`[${requestId}] General error in chat API:`, error);

    // Log detailed error information
    if (error.response) {
      console.error(`[${requestId}] Error response:`, {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers,
      });
    }

    // Log any other errors
    console.error(`[${requestId}] Unexpected error details:`, {
      message: error.message,
      stack: error.stack,
      cause: error.cause,
    });

    return NextResponse.json(
      {
        role: "assistant",
        content: "I apologize, but I encountered an error. Please try again.",
        error: "Server Error",
        details: error.message || "An unexpected error occurred.",
      },
      { status: 500 }
    );
  }
}
