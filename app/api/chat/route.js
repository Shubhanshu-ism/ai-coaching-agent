import OpenAI from "openai";
import { NextResponse } from "next/server";

// Fix the OpenAI client configuration with proper API key selection
const OPENROUTER_API_KEY =
  process.env.NEXT_PUBLIC_AI_OPENROUTER || process.env.OPENROUTER_API_KEY;

// Log environment variables for debugging (redacted for security)
console.log("Environment variables check:", {
  NEXT_PUBLIC_AI_OPENROUTER_EXISTS: !!process.env.NEXT_PUBLIC_AI_OPENROUTER,
  NEXT_PUBLIC_AI_OPENROUTER_PREFIX: process.env.NEXT_PUBLIC_AI_OPENROUTER
    ? process.env.NEXT_PUBLIC_AI_OPENROUTER.substring(0, 8) + "..."
    : "not set",
  OPENROUTER_API_KEY_EXISTS: !!process.env.OPENROUTER_API_KEY,
  OPENROUTER_API_KEY_PREFIX: process.env.OPENROUTER_API_KEY
    ? process.env.OPENROUTER_API_KEY.substring(0, 8) + "..."
    : "not set",
  USING_KEY_PREFIX: OPENROUTER_API_KEY
    ? OPENROUTER_API_KEY.substring(0, 8) + "..."
    : "no key available",
});

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "AI Coaching Agent",
  },
});

// Validate the OpenRouter configuration
if (!OPENROUTER_API_KEY) {
  console.error(
    "⚠️ OpenRouter API key is missing. Please check your environment variables."
  );
} else if (!OPENROUTER_API_KEY.startsWith("sk-or-")) {
  console.warn(
    "⚠️ OpenRouter API key doesn't have the expected 'sk-or-' prefix. This may cause issues."
  );
}

// Add this logging to check if the API key is correctly configured
console.log("OpenRouter Configuration:", {
  apiKeyConfigured: !!OPENROUTER_API_KEY,
  apiKeyLength: OPENROUTER_API_KEY ? OPENROUTER_API_KEY.length : 0,
  apiKeyPrefix: OPENROUTER_API_KEY
    ? OPENROUTER_API_KEY.substring(0, 8)
    : "none",
  baseURL: "https://openrouter.ai/api/v1",
});

// Keep a cache of recent requests to prevent duplicates
const requestCache = new Map();
const MAX_CACHE_SIZE = 50;
const CACHE_EXPIRY_MS = 30000; // 30 seconds

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

    const {
      topic,
      coachingOpt,
      msg,
      timestamp,
      isFeedbackRequest,
      summaryPrompt,
    } = requestBody;

    // Check for duplicate requests
    if (timestamp) {
      const lastUserMessage =
        Array.isArray(msg) && msg.length > 0 ? msg[msg.length - 1].content : "";

      // Create a composite key from timestamp and last message
      const cacheKey = `${timestamp}-${lastUserMessage.substring(0, 50)}`;

      if (requestCache.has(cacheKey)) {
        console.log(
          `[${requestId}] Duplicate request detected with key: ${cacheKey}`
        );

        // Return the cached response to ensure consistency
        const cachedResponse = requestCache.get(cacheKey);
        return NextResponse.json(cachedResponse);
      }

      // Clean up old cache entries if we've exceeded the maximum size
      if (requestCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = requestCache.keys().next().value;
        requestCache.delete(oldestKey);
      }
    }

    // Validate required fields (make topic optional)
    if (!coachingOpt || !msg) {
      console.error(`[${requestId}] Missing required fields in request:`, {
        topic,
        coachingOpt: coachingOpt?.name,
        msgCount: msg?.length,
        timestamp,
      });
      return NextResponse.json(
        {
          role: "assistant",
          content:
            "I apologize, but some required information is missing. Please try again.",
          error: "Missing required fields",
          details: "Coaching option or messages are missing from the request.",
        },
        { status: 400 }
      );
    }

    if (!OPENROUTER_API_KEY) {
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
      topic: topic || "Not specified (summary mode)",
      coachingOpt: coachingOpt.name,
      msgCount: msg.length,
      timestamp: timestamp || "Not provided",
      isFeedbackRequest: !!isFeedbackRequest,
      apiKey: OPENROUTER_API_KEY ? "Configured" : "Missing",
    });

    // For system message, use topic if provided, otherwise use "conversation" as placeholder
    const promptContent = coachingOpt.prompt.replace(
      "{user_topic}",
      topic || "conversation"
    );

    // Build our messages array
    let messages = [
      {
        role: "system",
        content: `${promptContent}\n\nIMPORTANT ADDITIONAL INSTRUCTIONS:\n1. MAINTAIN CONVERSATION CONTEXT: Always review all previous messages before responding. Never ask the same question twice and remember information the user has shared\n2. RESPOND TO STATED KNOWLEDGE LEVEL: If the user says they are a "beginner," "new," or have "no experience," immediately begin teaching basics without further assessment questions\n3. FORWARD PROGRESS: Always teach something new in each response rather than repeating information or asking clarifying questions repeatedly\n4. For technical topics like programming, databases, math, or science, begin with extremely basic concepts and simple analogies\n5. Each response should be unique and directly address what the user just said, while maintaining awareness of the entire conversation history\n6. Never use academic or complex language without immediately explaining it in simple terms\n7. For brief or unclear user responses, assume they need help and continue teaching rather than asking the same question again\n8. Be exceptionally patient and encouraging with beginners\n9. For technical subjects, use real-life examples that anyone can relate to\n10. If you detect the conversation is stalled with repeated similar exchanges, introduce a new foundational concept to move forward`,
      },
      ...msg,
    ];

    // If this is a feedback request, add the summary prompt
    if (isFeedbackRequest && summaryPrompt) {
      // Add the summary prompt as a final user message
      messages.push({
        role: "user",
        content: summaryPrompt,
      });

      console.log(`[${requestId}] Added summary prompt to request`);
    }

    console.log(`[${requestId}] Messages being sent:`, messages);

    try {
      console.log(
        `[${requestId}] Starting API request with ${messages.length} messages`
      );

      // Set a timeout for the OpenAI call
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("OpenAI API request timeout")), 25000)
      );

      let requestAttempts = 0;
      const maxAttempts = 2;
      let completion;

      // Retry logic for OpenRouter API
      while (requestAttempts < maxAttempts) {
        try {
          requestAttempts++;
          console.log(
            `[${requestId}] API attempt ${requestAttempts}/${maxAttempts}`
          );

          // Create the completion promise
          const completionPromise = openai.chat.completions
            .create({
              model: "anthropic/claude-3-haiku:official",
              messages,
              temperature: 0.5,
              max_tokens: 400,
              presence_penalty: 0.8,
              frequency_penalty: 0.7,
              timeout: 20000,
            })
            .catch((error) => {
              console.error("Error details from OpenRouter:", {
                message: error.message,
                type: error.type,
                status: error.status,
                details: error.details,
                stack: error.stack,
              });
              throw error; // Rethrow after logging
            });

          // Race the completion against the timeout
          completion = await Promise.race([completionPromise, timeoutPromise]);

          // If we get here, we got a response, so break out of retry loop
          break;
        } catch (apiError) {
          console.error(
            `[${requestId}] API attempt ${requestAttempts} failed:`,
            apiError.message
          );

          // If this is our last attempt, rethrow the error
          if (requestAttempts >= maxAttempts) {
            throw apiError;
          }

          // Otherwise wait before retrying
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

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
              "I didn't catch that. Could you repeat or rephrase your question?",
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
            content: "I need to refocus. What were you asking about again?",
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
              "I think I missed your question. Could you ask it one more time?",
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
            content: "Sorry, I didn't understand. Could you rephrase that?",
            error: "Empty response",
            details: "The AI model returned an empty string after trimming.",
          },
          { status: 500 }
        );
      }

      // Create the successful response
      const response = {
        role: "assistant",
        content: responseContent,
      };

      // If this was a feedback request, mark it as such
      if (isFeedbackRequest) {
        response.isFeedbackSummary = true;
      }

      // Cache the response with the timestamp if available
      if (timestamp) {
        const lastUserMessage =
          Array.isArray(msg) && msg.length > 0
            ? msg[msg.length - 1].content
            : "";

        const cacheKey = `${timestamp}-${lastUserMessage.substring(0, 50)}`;
        requestCache.set(cacheKey, response);

        // Set expiry for this cache item
        setTimeout(() => {
          requestCache.delete(cacheKey);
        }, CACHE_EXPIRY_MS);
      }

      // Log successful response
      console.log(
        `[${requestId}] Successful response:`,
        responseContent.substring(0, 50) + "..."
      );

      return NextResponse.json(response);
    } catch (openaiError) {
      console.error(`[${requestId}] OpenAI API Error:`, {
        message: openaiError.message,
        name: openaiError.name,
        stack: openaiError.stack?.split("\n").slice(0, 3).join("\n"),
        cause: openaiError.cause,
      });

      // Additional logging for more detail
      if (openaiError.response) {
        console.error(`[${requestId}] OpenAI Error Response Details:`, {
          status: openaiError.response.status,
          statusText: openaiError.response.statusText,
          data: JSON.stringify(openaiError.response.data).substring(0, 500),
        });
      }

      let errorResponse;

      if (openaiError.message && openaiError.message.includes("timeout")) {
        errorResponse = {
          role: "assistant",
          content:
            "I'm having trouble connecting right now. Could you ask a simpler question or try again in a moment?",
          error: "Request timeout",
          details: "The request to the OpenRouter API timed out.",
        };
      } else if (openaiError.response?.status === 401) {
        console.error(
          `[${requestId}] Authentication failed with API key:`,
          OPENROUTER_API_KEY
            ? `${OPENROUTER_API_KEY.substring(0, 6)}...`
            : "No key"
        );

        errorResponse = {
          role: "assistant",
          content:
            "I seem to be having a connection issue. Let's try something else or simpler.",
          error: "Authentication failed",
          details: "The OpenRouter API key is invalid or has expired.",
        };
      } else if (openaiError.response?.status === 429) {
        errorResponse = {
          role: "assistant",
          content:
            "I'm getting a lot of requests right now. Could we wait a moment and try again?",
          error: "Rate limit exceeded",
          details: "Too many requests to the OpenRouter API.",
        };
      } else if (openaiError.response?.status >= 500) {
        errorResponse = {
          role: "assistant",
          content:
            "My services are having some trouble at the moment. Let's try again with a simpler request.",
          error: "OpenRouter server error",
          details: `Server error with status ${openaiError.response?.status || "unknown"}.`,
        };
      } else if (
        openaiError.message.includes("network") ||
        openaiError.message.includes("fetch") ||
        openaiError.message.includes("connection")
      ) {
        errorResponse = {
          role: "assistant",
          content:
            "I'm having trouble connecting to my services. Please check your internet connection and try again.",
          error: "Network error",
          details: openaiError.message || "Network connectivity issue",
        };
      } else {
        // Extract relevant parts of the error for the log
        const errorMessage =
          openaiError.message?.substring(0, 150) || "Unknown error";
        const statusCode = openaiError.response?.status || "No status";

        console.error(
          `[${requestId}] Unhandled OpenAI error: ${errorMessage} (Status: ${statusCode})`
        );

        // Generic error
        errorResponse = {
          role: "assistant",
          content:
            "I think I got confused by that question. Could you try asking in a different way?",
          error: "OpenAI API Error",
          details: errorMessage,
        };
      }

      // Cache the error response too to prevent retrying the same failing request
      if (timestamp) {
        const lastUserMessage =
          Array.isArray(msg) && msg.length > 0
            ? msg[msg.length - 1].content
            : "";

        const cacheKey = `${timestamp}-${lastUserMessage.substring(0, 50)}`;
        requestCache.set(cacheKey, errorResponse);

        // Set a shorter expiry for error responses
        setTimeout(() => {
          requestCache.delete(cacheKey);
        }, CACHE_EXPIRY_MS / 2);
      }

      return NextResponse.json(errorResponse, {
        status: openaiError.response?.status || 500,
      });
    }
  } catch (error) {
    console.error(`[${requestId}] General error in chat API:`, {
      name: error.name,
      message: error.message,
      stack:
        error.stack?.split("\n").slice(0, 3).join("\n") || "No stack trace",
      type: typeof error,
    });

    // Log detailed error information
    if (error.response) {
      console.error(`[${requestId}] Error response:`, {
        status: error.response.status,
        data:
          typeof error.response.data === "object"
            ? JSON.stringify(error.response.data).substring(0, 200)
            : error.response.data,
        headers:
          error.response.headers &&
          typeof error.response.headers.entries === "function"
            ? Object.fromEntries(
                [...error.response.headers.entries()].filter(
                  ([key]) =>
                    !["authorization", "cookie"].includes(key.toLowerCase())
                )
              )
            : "No headers",
      });
    }

    // Categorize errors for better user responses
    let errorResponse = {
      role: "assistant",
      content: "I missed what you said. Could you try again?",
      error: "Server Error",
      details: error.message || "An unexpected error occurred.",
    };

    // Provide more specific responses based on error patterns
    if (error.message && error.message.includes("parse")) {
      errorResponse.content =
        "I had trouble understanding that. Could you try with a simpler question?";
      errorResponse.error = "Parsing Error";
    } else if (error.message && error.message.includes("timeout")) {
      errorResponse.content =
        "Our conversation is taking longer than expected. Let's try a different approach.";
      errorResponse.error = "Request Timeout";
    } else if (
      error.message &&
      (error.message.includes("network") || error.message.includes("connect"))
    ) {
      errorResponse.content =
        "I'm having trouble reaching my knowledge services. Please check your connection and try again.";
      errorResponse.error = "Network Error";
    }

    return NextResponse.json(errorResponse, { status: 500 });
  }
}
