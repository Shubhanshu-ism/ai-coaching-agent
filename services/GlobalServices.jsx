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

    console.log("Sending request to chat API with:", {
      topic,
      coachingOpt: options.name,
      msgCount: messages.length,
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

      return responseData;
    } catch (fetchError) {
      if (fetchError.name === "AbortError") {
        console.error("Request timeout");
        throw new Error("Request timed out. Please try again.");
      }
      throw fetchError;
    }
  } catch (error) {
    console.error("Error in AIModel:", error);

    // Handle specific error types
    if (error.message.includes("401")) {
      return {
        role: "assistant",
        content:
          "I apologize, but there's an authentication issue with the AI service. Please try again later.",
      };
    }

    if (error.message.includes("429")) {
      return {
        role: "assistant",
        content:
          "I apologize, but the AI service is currently busy. Please try again in a moment.",
      };
    }

    // Enhanced error message
    return {
      role: "assistant",
      content: `I apologize, but I encountered an error: ${error.message || "Unknown error"}. Please try again or refresh the page.`,
    };
  }
};
