import { CoachingOption } from "./Options";

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

    // Ensure msg is an array of messages
    const messages = Array.isArray(msg)
      ? msg
      : [{ role: "user", content: msg }];

    // Add a timestamp to prevent cache issues
    const timestamp = new Date().getTime();

    console.log("Sending request to chat API with:", {
      topic,
      coachingOpt: options.name,
      msgCount: messages.length,
      timestamp,
    });

    // Add timeout to the fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      console.log("Sending request to chat API with parameters:", {
        topic: typeof topic === "string" ? topic.substring(0, 30) : "undefined",
        coachingOpt: options?.name || "undefined",
        messageCount: messages?.length || 0,
        firstMessage:
          messages?.length > 0
            ? messages[0]?.content?.substring(0, 30) + "..."
            : "empty",
      });

      // Create a more robust fetch with retries and better error handling
      const MAX_RETRIES = 2;
      let lastError = null;
      let responseText = "";

      for (let retryCount = 0; retryCount <= MAX_RETRIES; retryCount++) {
        if (retryCount > 0) {
          console.log(
            `Retry attempt ${retryCount}/${MAX_RETRIES} for API call`
          );
          // Wait before retrying with exponential backoff
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1))
          );
        }

        try {
          const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
            },
            body: JSON.stringify({
              topic,
              coachingOpt: options,
              msg: messages,
              timestamp: Date.now(), // Add timestamp to prevent caching issues
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId); // Clear the timeout if request completes

          // Log basic response info
          console.log("API Response received:", {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
          });

          try {
            responseText = await response.text();

            // Check if the response is empty
            if (!responseText || responseText.trim() === "") {
              console.error("Empty response received from server");
              if (retryCount < MAX_RETRIES) {
                lastError = new Error("Empty response from server");
                continue; // Try again
              } else {
                // Return a fallback on the last retry
                return {
                  role: "assistant",
                  content:
                    "I'm having trouble right now. Could you try again in a moment?",
                };
              }
            }

            // Try to parse the response as JSON
            let responseData;
            try {
              responseData = JSON.parse(responseText);
            } catch (parseError) {
              console.error("Failed to parse response as JSON:", parseError);
              console.error(
                "Raw response text:",
                responseText.substring(0, 200)
              );

              if (retryCount < MAX_RETRIES) {
                lastError = parseError;
                continue; // Try again
              } else {
                // Return a fallback on the last retry
                return {
                  role: "assistant",
                  content:
                    "I had trouble processing that. Could you rephrase your question?",
                };
              }
            }

            // Process the response normally
            if (!response.ok) {
              // Capture detailed error information
              const statusCode = response.status;
              const statusText = response.statusText;

              console.error("API Error:", {
                status: statusCode,
                statusText: statusText,
                data: responseData || {},
                url: "/api/chat",
                method: "POST",
              });

              // For network issues or server errors, provide a fallback response
              if (statusCode >= 500) {
                console.error("Server error detected:", statusCode);
                return {
                  role: "assistant",
                  content:
                    "I'm having trouble connecting to my services right now. Let's try a simpler question, or could you rephrase that?",
                };
              }

              if (
                statusCode === 408 ||
                statusCode === 429 ||
                statusCode === 503
              ) {
                console.error("Rate limit or timeout error:", statusCode);
                return {
                  role: "assistant",
                  content:
                    "My services are a bit busy right now. Could you wait a moment and try again?",
                };
              }

              // Create a more detailed error message
              const errorDetails =
                responseData?.error || responseData?.details || "";

              // For the specific empty completion error, provide a better fallback
              if (
                errorDetails.includes("Empty completion object") ||
                errorDetails.includes("Invalid completion structure") ||
                errorDetails.includes("Invalid response from AI model")
              ) {
                return {
                  role: "assistant",
                  content:
                    "I'm having trouble understanding that. Could you tell me specifically what you'd like to learn about " +
                    (topic || "this topic") +
                    "?",
                };
              }

              // If we get here, it's a different type of error
              console.error(
                `HTTP error ${response.status} details:`,
                responseData
              );

              return {
                role: "assistant",
                content:
                  "I didn't catch that. Could you try once more with different wording?",
              };
            }

            // Enhanced validation of response format
            if (!responseData) {
              console.error("Empty response data");
              return {
                role: "assistant",
                content:
                  "I didn't catch what you were saying. Could you repeat that in a bit more detail?",
              };
            }

            if (typeof responseData !== "object") {
              console.error("Invalid response type:", typeof responseData);
              throw new Error(`Invalid response type: ${typeof responseData}`);
            }

            if (!responseData.role || !responseData.content) {
              console.error("Invalid response format:", responseData);
              throw new Error(
                `Missing required fields in response: ${JSON.stringify(responseData)}`
              );
            }

            // Add a small unique identifier to avoid duplicate detection
            // while preserving the actual response content for the user
            if (responseData.content) {
              // Ensure the response ends with proper punctuation
              const content = responseData.content.trim();
              const lastChar = content.slice(-1);
              const needsPunctuation = ![".", "!", "?", ",", ";", ":"].includes(
                lastChar
              );

              // Add timestamp to the response in a way that won't be visible to the user
              responseData._timestamp = timestamp;

              // If needed, ensure the response has proper ending punctuation
              if (needsPunctuation) {
                responseData.content = content + ".";
              }
            }

            return responseData;
          } catch (parseError) {
            console.error("Failed to parse response:", parseError);
            console.error(
              "Raw response status:",
              response.status,
              response.statusText
            );
            throw new Error(
              `Failed to read server response: ${parseError.message}. Raw status: ${response.status}`
            );
          }
        } catch (networkError) {
          console.error("Network error during fetch call:", networkError);
          throw new Error(`Network request failed: ${networkError.message}`);
        }
      }

      throw new Error("All retry attempts failed");
    } catch (fetchError) {
      if (fetchError.name === "AbortError") {
        console.error("Request timeout");
        return {
          role: "assistant",
          content:
            "Sorry, it took too long to process your request. Please try again with a simpler question.",
        };
      }

      // Log detailed error information
      console.error("Fetch error in AIModel:", {
        name: fetchError.name,
        message: fetchError.message,
        stack:
          fetchError.stack?.split("\n").slice(0, 3).join("\n") ||
          "No stack trace",
        cause: fetchError.cause,
      });

      throw fetchError;
    }
  } catch (error) {
    console.error("Error in AIModel:", {
      name: error.name,
      message: error.message,
      stack:
        error.stack?.split("\n").slice(0, 3).join("\n") || "No stack trace",
    });

    // Handle specific error types with user-friendly responses
    if (error.message.includes("401")) {
      return {
        role: "assistant",
        content:
          "I'm having trouble connecting to my knowledge base. Let's try a different question.",
      };
    }

    if (error.message.includes("429")) {
      return {
        role: "assistant",
        content:
          "It looks like we're having a busy moment. Could you wait a moment and then continue?",
      };
    }

    if (
      error.message.includes("Network request failed") ||
      error.message.includes("fetch")
    ) {
      return {
        role: "assistant",
        content:
          "I'm having trouble connecting to the network. Please check your internet connection and try again.",
      };
    }

    // For server errors (status 500+)
    if (
      error.message.includes("500") ||
      error.message.includes("502") ||
      error.message.includes("503") ||
      error.message.includes("504")
    ) {
      return {
        role: "assistant",
        content:
          "My services are experiencing some issues right now. Let's try a simpler question or try again in a moment.",
      };
    }

    // For duplicate response errors, create a unique response
    if (error.message.includes("Duplicate")) {
      return {
        role: "assistant",
        content:
          "I think we may have gotten off track. Let's refocus - what specific aspect of " +
          (topic || "this subject") +
          " would you like me to explain?",
      };
    }

    // For parsing errors
    if (error.message.includes("JSON") || error.message.includes("parse")) {
      return {
        role: "assistant",
        content:
          "I received an unexpected response format. Let's try a different approach or question.",
      };
    }

    // Enhanced error message (made conversational and friendly)
    return {
      role: "assistant",
      content:
        "I seem to have lost my train of thought. Could you try saying that again or maybe phrase it differently?",
    };
  }
};

export const AIModelToGenerateFeedbackAndNotes = async (
  topic,
  coachingOpt,
  msg
) => {
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

    // Ensure msg is an array of messages
    const messages = Array.isArray(msg)
      ? [...msg] // Create a copy to avoid modifying the original conversation
      : [{ role: "user", content: msg }];

    // Create a separate prompt instead of adding to the messages array
    const summaryPrompt = `Please generate a detailed summary using this format: ${options.summeryPrompt.replace("{user_topic}", topic)}`;

    console.log("Sending feedback request to chat API with:", {
      topic,
      coachingOpt: options.name,
      msgCount: messages.length,
      summaryPrompt: summaryPrompt.substring(0, 50) + "...",
    });

    // Add timeout to the fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic,
          coachingOpt: options,
          msg: messages,
          isFeedbackRequest: true, // Add flag to indicate this is a feedback request
          summaryPrompt, // Send the summary prompt separately
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId); // Clear the timeout if request completes

      let responseData;
      try {
        const text = await response.text(); // First get the raw response text
        console.log(
          "Raw API response:",
          text.substring(0, 150) + (text.length > 150 ? "..." : "")
        );

        try {
          responseData = text ? JSON.parse(text) : {};
        } catch (parseError) {
          console.error("Failed to parse response as JSON:", parseError);
          throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
        }

        console.log("Parsed API Response:", responseData);
      } catch (e) {
        console.error("Failed to read response:", e);
        throw new Error(`Failed to read server response: ${e.message}`);
      }

      if (!response.ok) {
        console.error("API Error:", {
          status: response.status,
          statusText: response.statusText,
          data: responseData,
        });

        // Create a more detailed error message
        const errorDetails = responseData?.error || responseData?.details || "";

        // For the specific empty completion error, provide a better fallback
        if (
          errorDetails.includes("Empty completion object") ||
          errorDetails.includes("Invalid completion structure")
        ) {
          return {
            role: "assistant",
            content:
              "I apologize, but the AI service is having trouble processing your request. Let's try a different question or approach. Could you rephrase or ask something else?",
          };
        }

        throw new Error(
          `HTTP error ${response.status}: ${errorDetails || response.statusText || "Unknown error"}`
        );
      }

      // Enhanced validation of response format
      if (!responseData) {
        console.error("Empty response data");
        return {
          role: "assistant",
          content:
            "I apologize, but I'm having trouble generating a response right now. Could you try asking something else?",
        };
      }

      if (typeof responseData !== "object") {
        console.error("Invalid response type:", typeof responseData);
        throw new Error(`Invalid response type: ${typeof responseData}`);
      }

      if (!responseData.role || !responseData.content) {
        console.error("Invalid response format:", responseData);
        throw new Error(
          `Missing required fields in response: ${JSON.stringify(responseData)}`
        );
      }

      // Mark this response as a feedback summary to prevent it from being added to the chat
      responseData.isFeedbackSummary = true;

      return responseData;
    } catch (fetchError) {
      if (fetchError.name === "AbortError") {
        console.error("Request timeout for feedback");
        return {
          role: "assistant",
          content:
            "Sorry, it took too long to generate your feedback. Please try again.",
          isFeedbackSummary: true,
        };
      }

      // Log detailed error information
      console.error("Fetch error in AIModelToGenerateFeedbackAndNotes:", {
        name: fetchError.name,
        message: fetchError.message,
        stack:
          fetchError.stack?.split("\n").slice(0, 3).join("\n") ||
          "No stack trace",
        cause: fetchError.cause,
      });

      throw fetchError;
    }
  } catch (error) {
    console.error("Error in AIModelToGenerateFeedbackAndNotes:", {
      name: error.name,
      message: error.message,
      stack:
        error.stack?.split("\n").slice(0, 3).join("\n") || "No stack trace",
    });

    // Handle specific error types
    if (error.message.includes("401")) {
      return {
        role: "assistant",
        content:
          "I apologize, but there's an authentication issue preventing me from generating feedback. Please try again later.",
        isFeedbackSummary: true,
      };
    }

    if (error.message.includes("429")) {
      return {
        role: "assistant",
        content:
          "I apologize, but the feedback service is currently busy. Please try again in a moment.",
        isFeedbackSummary: true,
      };
    }

    if (
      error.message.includes("Network request failed") ||
      error.message.includes("fetch")
    ) {
      return {
        role: "assistant",
        content:
          "I'm having trouble connecting to the network to generate your feedback. Please check your internet connection and try again.",
        isFeedbackSummary: true,
      };
    }

    // For server errors (status 500+)
    if (
      error.message.includes("500") ||
      error.message.includes("502") ||
      error.message.includes("503") ||
      error.message.includes("504")
    ) {
      return {
        role: "assistant",
        content:
          "Our feedback services are experiencing some issues right now. Please try again in a moment.",
        isFeedbackSummary: true,
      };
    }

    // For parsing errors
    if (error.message.includes("JSON") || error.message.includes("parse")) {
      return {
        role: "assistant",
        content:
          "I received an unexpected format while trying to generate your feedback. Let's try again.",
        isFeedbackSummary: true,
      };
    }

    // Enhanced error message
    return {
      role: "assistant",
      content: `I'm sorry, but I encountered an issue while generating your feedback: ${error.message.includes(":") ? error.message.split(":")[0] : "Unknown error"}. Please try again.`,
      isFeedbackSummary: true,
    };
  }
};
