"use client";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { CoachingExpert } from "@/services/Options";
import { UserButton } from "@stackframe/stack";
import Webcam from "react-webcam";
import { useQuery } from "convex/react";
import Image from "next/image";
import { useParams } from "next/navigation";
import React, { useEffect, useState, useRef, useContext } from "react";
import dynamic from "next/dynamic";
import {
  AIModel,
  AIModelToGenerateFeedbackAndNotes,
} from "@/services/GlobalServices";
import { Loader2Icon } from "lucide-react";
import ChatBox from "./_component/ChatBox";
import { useMutation } from "convex/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UserContext } from "@/app/_context/UserContext";

// Import RecordRTC with proper configuration
const RecordRTC = dynamic(
  () => import("recordrtc").then((mod) => mod.default),
  {
    ssr: false,
  }
);

// Add the cleanup function at a higher scope, before any React component functions
// Add it after the imports

// Utility function to clean up conversation arrays by flattening and deduplicating
const cleanupConversationArray = (conversation) => {
  if (!Array.isArray(conversation)) {
    console.error("Invalid conversation data:", conversation);
    return []; // Return empty array for invalid input
  }

  // Flatten the nested arrays
  const flattenConversation = (arr) => {
    const result = [];

    const flatten = (items) => {
      if (!items) return;

      for (const item of items) {
        if (Array.isArray(item)) {
          flatten(item);
        } else if (
          item &&
          typeof item === "object" &&
          item.role &&
          item.content
        ) {
          result.push(item);
        }
      }
    };

    flatten(arr);
    return result;
  };

  // Deduplicate messages based on content and role
  const deduplicateMessages = (messages) => {
    const seen = new Set();
    return messages.filter((message) => {
      const key = `${message.role}:${message.content}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const flattened = flattenConversation(conversation);
  const deduplicated = deduplicateMessages(flattened);

  // Limit conversation size to prevent excessive memory usage and API issues
  const MAX_MESSAGES = 50; // Set a reasonable limit
  const limitedMessages =
    deduplicated.length > MAX_MESSAGES
      ? deduplicated.slice(-MAX_MESSAGES)
      : deduplicated;

  console.log(
    `Cleaned up conversation: ${conversation.length} items → ${flattened.length} flattened → ${deduplicated.length} deduplicated → ${limitedMessages.length} limited`
  );

  return limitedMessages;
};

function DiscussionRoom() {
  const { roomid } = useParams();
  const DiscussionRoomData = useQuery(api.DiscussionRoom.GetDiscussionRoom, {
    id: roomid,
  });
  const { userData, setUserData } = useContext(UserContext);
  // All useState hooks
  const [enableMic, setEnableMic] = useState(false);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [permissionError, setPermissionError] = useState("");
  const [transcripts, setTranscripts] = useState([]);
  const [conversation, setConversation] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expert, setExpert] = useState({
    name: "Salli",
    avatar: "/t2.jpg",
  });
  const [isStarted, setIsStarted] = useState(false);
  const [enableFeedbackNotes, setEnableFeedbackNotes] = useState(false);
  const [feedbackContent, setFeedbackContent] = useState("");

  // All useRef hooks
  const recorder = useRef(null);
  const stream = useRef(null);
  const silenceTimeout = useRef(null);
  const speechRecognition = useRef(null);

  // All useMutation hooks
  const UpdateConversation = useMutation(api.DiscussionRoom.UpdateConversation);
  const UpdateSessionFeedback = useMutation(
    api.DiscussionRoom.UpdateSessionFeedback
  );

  // Add new state to track speech recognition status
  const [isSpeechRecognitionActive, setIsSpeechRecognitionActive] =
    useState(false);

  // Add new state to track if we're waiting for AI response
  const [isWaitingForAI, setIsWaitingForAI] = useState(false);

  // Add new state for pause functionality
  const [isPaused, setIsPaused] = useState(false);

  // Add to the beginning of the file with other state declarations
  const [listeningNoSpeech, setListeningNoSpeech] = useState(false);
  const lastSpeechTimestamp = useRef(Date.now());
  const silenceDetectionTimer = useRef(null);

  // Add these new state variables
  const [speechRecognitionErrors, setSpeechRecognitionErrors] = useState(0);
  const [showRecognitionStatus, setShowRecognitionStatus] = useState(false);
  const recognitionResetTimer = useRef(null);
  const updateUserToken = useMutation(api.users.UpdateUserToken);
  // Add function to handle conversation start
  const handleStart = async () => {
    try {
      setLoading(true);
      setIsStarted(true);

      // Start speech recognition if it's not already active
      if (
        speechRecognition.current &&
        !isSpeechRecognitionActive &&
        !isPaused
      ) {
        try {
          console.log("Starting speech recognition for new conversation");
          speechRecognition.current.start();
        } catch (startError) {
          console.error("Error starting speech recognition:", startError);
          // Re-initialize if start failed
          speechRecognition.current = null;
          initializeSpeechRecognition();
          if (speechRecognition.current) {
            speechRecognition.current.start();
          }
        }
      }

      // Start recording if it's not already active
      if (recorder.current && !recorder.current.state) {
        console.log("Starting audio recording");
        await recorder.current.startRecording();
      }

      // Initialize the conversation with a more detailed, personalized greeting
      setConversation([
        {
          role: "assistant",
          content: `Hello! I'm ${expert.name}, your ${DiscussionRoomData?.coachingOption} expert on "${DiscussionRoomData?.topic}". I'll be guiding you through this topic with interactive discussion. Feel free to ask questions or share what you already know, and we'll build on that together. What would you like to focus on first?`,
        },
      ]);
    } catch (error) {
      console.error("Error starting conversation:", error);
      // Show an error message to the user
      alert("Failed to start conversation. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Add function to handle pause/resume
  const handlePauseResume = async () => {
    try {
      setLoading(true);
      console.log(
        "Current pause state:",
        isPaused,
        "Speech active:",
        isSpeechRecognitionActive
      );

      if (isPaused) {
        // Resume speech recognition and recording
        console.log("Attempting to resume speech recognition and recording...");
        setIsPaused(false); // Update state first

        // Start recording if it's not already active
        if (recorder.current) {
          try {
            if (!recorder.current.state) {
              console.log("Resuming audio recording");
              await recorder.current.startRecording();
            } else {
              console.log("Audio recording already active");
            }
          } catch (recordError) {
            console.error("Error resuming recording:", recordError);
            // Re-initialize recorder if needed
            if (stream.current) {
              const RecordRTCModule = await import("recordrtc");
              const RecordRTCConstructor = RecordRTCModule.default;
              recorder.current = new RecordRTCConstructor(stream.current, {
                type: "audio",
                mimeType: "audio/webm;codecs=pcm",
                recorderType: RecordRTCConstructor.StereoAudioRecorder,
                timeSlice: 250,
                desiredSampRate: 16000,
                numberOfAudioChannels: 1,
                bufferSize: 4096,
                audioBitsPerSecond: 128000,
              });
              await recorder.current.startRecording();
            }
          }
        }

        // Only start speech recognition if not already active and not waiting for AI
        if (
          speechRecognition.current &&
          !isSpeechRecognitionActive &&
          !isWaitingForAI
        ) {
          try {
            console.log("Starting speech recognition");
            await speechRecognition.current.start();
            console.log("Speech recognition resumed successfully");
          } catch (startError) {
            console.error("Error starting speech recognition:", startError);
            // Re-initialize speech recognition if start failed
            speechRecognition.current = null;
            initializeSpeechRecognition();
            if (speechRecognition.current) {
              try {
                console.log("Retrying with new speech recognition instance");
                await speechRecognition.current.start();
              } catch (retryError) {
                console.error(
                  "Failed to restart speech recognition:",
                  retryError
                );
                alert(
                  "Failed to restart speech recognition. Please try disconnecting and reconnecting."
                );
              }
            }
          }
        } else {
          console.log("Speech recognition already active or waiting for AI");
        }
      } else {
        // Pause speech recognition and recording
        console.log("Attempting to pause speech recognition and recording...");
        setIsPaused(true); // Update state first

        // Stop recording if active
        if (recorder.current && recorder.current.state === "recording") {
          try {
            console.log("Pausing audio recording");
            await recorder.current.pauseRecording();
          } catch (pauseError) {
            console.error("Error pausing recording:", pauseError);
          }
        }

        // Only stop speech recognition if already active
        if (speechRecognition.current && isSpeechRecognitionActive) {
          try {
            console.log("Stopping speech recognition");
            speechRecognition.current.stop();
            console.log("Speech recognition paused successfully");
          } catch (stopError) {
            console.error("Error stopping speech recognition:", stopError);
            // Force the state update even if stop failed
            setIsSpeechRecognitionActive(false);
          }
        } else {
          console.log("Speech recognition not active, nothing to pause");
        }
      }
    } catch (err) {
      console.error("Error toggling pause:", err);
      // Reset states on error
      setIsPaused(false);
      setIsSpeechRecognitionActive(false);

      // Re-initialize speech recognition on error
      speechRecognition.current = null;
      initializeSpeechRecognition();
    } finally {
      setLoading(false);
    }
  };

  // Define disconnectFromServer before using it in useEffect
  const disconnectFromServer = async (e) => {
    setLoading(true);
    if (e && e.preventDefault) e.preventDefault();
    try {
      setIsStarted(false);
      setIsPaused(false);
      setListeningNoSpeech(false);
      setShowRecognitionStatus(false);
      setSpeechRecognitionErrors(0);

      if (recognitionResetTimer.current) {
        clearTimeout(recognitionResetTimer.current);
        recognitionResetTimer.current = null;
      }

      if (silenceDetectionTimer.current) {
        clearInterval(silenceDetectionTimer.current);
        silenceDetectionTimer.current = null;
      }
      if (speechRecognition.current && isSpeechRecognitionActive) {
        speechRecognition.current.stop();
        speechRecognition.current = null;
        setIsSpeechRecognitionActive(false);
        setIsWaitingForAI(false);
        console.log("Speech recognition stopped");
      }

      if (recorder.current) {
        await recorder.current.stopRecording(() => {
          const blob = recorder.current.getBlob();
          recorder.current = null;
          console.log("Recording stopped");
        });
      }

      if (stream.current) {
        stream.current.getTracks().forEach((track) => {
          track.stop();
          console.log("Audio track stopped:", track.kind);
        });
        stream.current = null;
      }

      if (silenceTimeout.current) {
        clearTimeout(silenceTimeout.current);
        silenceTimeout.current = null;
      }

      setEnableMic(false);
      console.log("Successfully disconnected from server");
    } catch (err) {
      console.error("Error stopping recording:", err);
    } finally {
      if (DiscussionRoomData?._id) {
        await UpdateConversation({
          id: DiscussionRoomData._id,
          conversation: conversation,
        });
      }
      setLoading(false);
      setEnableFeedbackNotes(true);
    }
  };
  const UpdateUserTokenMethod = async (text) => {
    const tokenCount = text.trim().split(/\s+/).length;
    const result = await updateUserToken({
      id: userData._id,
      credits: Number(userData.credits) - Number(tokenCount),
    });
    if (result) {
      console.log("User token updated successfully");
      setUserData((prev) => ({
        ...prev,
        credits: Number(prev.credits) - Number(tokenCount),
      }));
    }
  };
  // All useEffect hooks
  useEffect(() => {
    if (DiscussionRoomData) {
      const Expert = CoachingExpert.find(
        (item) => item.name === DiscussionRoomData.expertName
      );
      if (Expert) {
        setExpert(Expert);
      }

      // Load existing conversation if available
      if (
        DiscussionRoomData.conversation &&
        DiscussionRoomData.conversation.length > 0
      ) {
        setConversation(DiscussionRoomData.conversation);
        setIsStarted(true); // Mark conversation as already started
      }
    }
  }, [DiscussionRoomData]);

  useEffect(() => {
    return () => {
      disconnectFromServer();
    };
  }, []);

  // Show loading state only when data is being fetched
  if (DiscussionRoomData === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2Icon className="animate-spin h-8 w-8" />
      </div>
    );
  }

  // Process audio buffer and generate transcript object
  const processAudioBuffer = async (buffer) => {
    // In a real implementation, you would send this buffer to a speech-to-text service
    // Since we're using Web Speech API separately, this function is primarily for demonstration
    // of what the output format would look like

    const timestamp = Date.now();
    const audioStart = timestamp - 250; // Assuming 250ms chunks from timeSlice
    const audioEnd = timestamp;

    // For demo purposes, we're returning a placeholder object
    // In production, this would be populated with actual transcription data
    return {
      message_type: "partialTranscript", // This will be updated by the speech recognition
      text: "", // Will be populated by speech recognition
      words: [], // Would contain word-level details if available
      audioStart,
      audioEnd,
      created: new Date().toISOString(),
      confidence: 0.0, // Will be updated with actual confidence
      text_formatted: "", // Will be populated by speech recognition
    };
  };

  const initializeSpeechRecognition = () => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.error("Speech recognition not supported in this browser");
        return false;
      }

      // Clean up any existing instance first
      if (speechRecognition.current) {
        try {
          if (isSpeechRecognitionActive) {
            speechRecognition.current.stop();
            console.log("Stopped existing speech recognition instance");
          }
          speechRecognition.current.onstart = null;
          speechRecognition.current.onend = null;
          speechRecognition.current.onerror = null;
          speechRecognition.current.onresult = null;
        } catch (e) {
          console.error("Error cleaning up speech recognition:", e);
        }
        // Reset state after cleanup
        setIsSpeechRecognitionActive(false);
      }

      // Create a new instance
      speechRecognition.current = new SpeechRecognition();
      console.log("Created new speech recognition instance");

      // Configure for optimal recognition
      speechRecognition.current.continuous = true;
      speechRecognition.current.interimResults = true;
      speechRecognition.current.lang = "en-US";
      speechRecognition.current.maxAlternatives = 1;

      // Increase the silence timeout (milliseconds)
      // This property may not be supported in all browsers
      if ("speechSetting" in speechRecognition.current) {
        speechRecognition.current.speechSetting = {
          silenceTimeout: 15000, // 15 seconds of silence before timeout
        };
      }

      const startSilenceDetection = () => {
        // Clear any existing timer
        if (silenceDetectionTimer.current) {
          clearInterval(silenceDetectionTimer.current);
        }

        // Start a new timer to check for silence
        silenceDetectionTimer.current = setInterval(() => {
          const now = Date.now();
          const silenceDuration = now - lastSpeechTimestamp.current;

          // If we've been silent for more than 8 seconds, show the visual indicator
          if (
            silenceDuration > 8000 &&
            isSpeechRecognitionActive &&
            !isWaitingForAI &&
            !isPaused
          ) {
            setListeningNoSpeech(true);
          } else {
            setListeningNoSpeech(false);
          }
        }, 1000); // Check every second
      };

      const stopSilenceDetection = () => {
        if (silenceDetectionTimer.current) {
          clearInterval(silenceDetectionTimer.current);
          silenceDetectionTimer.current = null;
        }
        setListeningNoSpeech(false);
      };

      speechRecognition.current.onstart = () => {
        console.log("Speech recognition started");
        setIsSpeechRecognitionActive(true);
        setListeningNoSpeech(false);
        lastSpeechTimestamp.current = Date.now(); // Reset timestamp when starting
        startSilenceDetection();
      };

      speechRecognition.current.onend = () => {
        console.log("Speech recognition ended, paused state:", isPaused);
        setIsSpeechRecognitionActive(false);
        stopSilenceDetection();

        // Only restart if we're not paused, not waiting for AI, and still want it to be active
        // Important: Check the current value of isPaused
        if (
          enableMic &&
          !isWaitingForAI &&
          !isPaused &&
          !isSpeechRecognitionActive &&
          isStarted
        ) {
          console.log("Restarting speech recognition...");
          setTimeout(() => {
            // Double-check state right before restarting
            if (
              speechRecognition.current &&
              !isSpeechRecognitionActive &&
              !isWaitingForAI &&
              !isPaused &&
              enableMic &&
              isStarted
            ) {
              try {
                console.log("Actually restarting speech recognition now");
                speechRecognition.current.start();
              } catch (error) {
                console.error("Error restarting speech recognition:", error);
              }
            } else {
              console.log(
                "Conditions changed, not restarting speech recognition"
              );
            }
          }, 300); // Slightly longer delay to prevent rapid restart errors
        } else {
          console.log("Not restarting speech recognition because:", {
            isPaused,
            isWaitingForAI,
            enableMic,
            isStarted,
          });
        }
      };

      speechRecognition.current.onerror = (event) => {
        // Special case for no-speech error - don't treat it as a critical error
        if (event.error === "no-speech") {
          // Log as info instead of error to prevent console error messages
          console.log("Speech recognition info: No speech detected");
          return; // Don't proceed with the error handling logic
        }

        // Increment error counter
        setSpeechRecognitionErrors((prev) => prev + 1);

        // Show status message for certain errors
        if (
          [
            "network",
            "service-not-allowed",
            "aborted",
            "audio-capture",
            "not-allowed",
          ].includes(event.error)
        ) {
          setShowRecognitionStatus(true);
          // Auto hide after 5 seconds
          if (recognitionResetTimer.current) {
            clearTimeout(recognitionResetTimer.current);
          }
          recognitionResetTimer.current = setTimeout(() => {
            setShowRecognitionStatus(false);
          }, 5000);
        }

        // Only log as error for real errors
        console.error("Speech recognition error:", event.error);

        // Regular handling for other errors
        setIsSpeechRecognitionActive(false);
        // Only restart on error if we're not waiting for AI, not paused, and still want it to be active
        if (
          enableMic &&
          !isWaitingForAI &&
          !isPaused &&
          !isSpeechRecognitionActive
        ) {
          // Use a longer delay for recovery based on error count
          const recoveryDelay = Math.min(speechRecognitionErrors * 300, 2000);
          console.log(
            `Attempting recovery in ${recoveryDelay}ms (error #${speechRecognitionErrors})`
          );

          setTimeout(() => {
            if (
              speechRecognition.current &&
              !isSpeechRecognitionActive &&
              !isWaitingForAI &&
              !isPaused
            ) {
              try {
                speechRecognition.current.start();
                console.log("Speech recognition restarted after error");
              } catch (error) {
                console.error("Failed to restart speech recognition:", error);

                // Complete re-initialization if we've had multiple errors
                if (speechRecognitionErrors > 3) {
                  console.log(
                    "Multiple errors detected, fully re-initializing speech recognition"
                  );
                  speechRecognition.current = null;
                  const success = initializeSpeechRecognition();
                  if (success && speechRecognition.current) {
                    try {
                      speechRecognition.current.start();
                      // Reset error counter on successful restart
                      setSpeechRecognitionErrors(0);
                    } catch (startError) {
                      console.error(
                        "Failed to start after re-initialization:",
                        startError
                      );
                    }
                  }
                }
              }
            }
          }, recoveryDelay);
        }
      };

      speechRecognition.current.onresult = async (event) => {
        // Update the last speech timestamp whenever we get a result
        lastSpeechTimestamp.current = Date.now();
        // Reset the no speech indicator
        setListeningNoSpeech(false);

        let interimTranscript = "";
        let finalTranscript = "";
        let confidence = 0;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          confidence = event.results[i][0].confidence;

          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        const now = Date.now();

        const generateWords = (text) => {
          if (!text) return [];
          return text.split(" ").map((word, index) => ({
            word,
            start: now - text.length * 50 + index * 50,
            end: now - text.length * 50 + (index + 1) * 50,
            confidence,
          }));
        };

        if (interimTranscript) {
          const partialResult = {
            message_type: "partialTranscript",
            text: interimTranscript,
            words: generateWords(interimTranscript),
            audioStart: now - 1000,
            audioEnd: now,
            created: new Date().toISOString(),
            confidence,
            text_formatted: interimTranscript,
          };

          setTranscripts((prev) => [
            ...prev.filter((t) => t.message_type !== "partialTranscript"),
            partialResult,
          ]);
        }

        if (finalTranscript) {
          const finalResult = {
            message_type: "finalTranscript",
            text: finalTranscript,
            words: generateWords(finalTranscript),
            audioStart: now - 2000,
            audioEnd: now,
            created: new Date().toISOString(),
            confidence,
            text_formatted: finalTranscript,
          };

          setTranscripts((prev) => [
            ...prev.filter((t) => t.message_type !== "partialTranscript"),
            finalResult,
          ]);

          // Add the final transcript to the conversation as a user message
          setConversation((prev) => {
            const userMessage = { role: "user", content: finalResult.text };
            const updatedConversation = [...prev, userMessage];

            // Clean up the conversation to prevent nested arrays and duplicates
            const cleanedConversation =
              cleanupConversationArray(updatedConversation);
            return cleanedConversation;
          });

          // Only call AIModel if DiscussionRoomData is available and transcript is not empty
          if (
            DiscussionRoomData?.topic &&
            DiscussionRoomData?.coachingOption &&
            finalTranscript.trim()
          ) {
            try {
              setLoading(true);
              setIsWaitingForAI(true); // Set waiting state before stopping speech recognition

              // Stop speech recognition while waiting for AI response
              if (speechRecognition.current && isSpeechRecognitionActive) {
                try {
                  speechRecognition.current.stop();
                  console.log(
                    "Stopped speech recognition while waiting for AI"
                  );
                } catch (stopError) {
                  console.error(
                    "Error stopping speech recognition:",
                    stopError
                  );
                }
              }

              // Get the complete conversation history for better context
              const conversationHistory = conversation;
              console.log(
                "Sending conversation with",
                conversationHistory.length,
                "messages"
              );

              // Add retry logic for AI response
              let aiResponse;
              let retryCount = 0;
              const maxRetries = 3;

              // Get last 5 messages for better context, or all if fewer than 5
              const contextMessages =
                cleanupConversationArray(conversationHistory);
              const contextLength = Math.min(5, contextMessages.length);
              const messagesToSend = contextMessages.slice(-contextLength);

              // Add timestamp to ensure request uniqueness
              const timestamp = new Date().getTime();
              console.log(
                `AI request attempt ${retryCount + 1} at ${timestamp} with ${messagesToSend.length} messages`
              );

              while (!aiResponse && retryCount < maxRetries) {
                try {
                  // Wrap AI model call in a timeout
                  const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(
                      () => reject(new Error("AI request timeout")),
                      20000
                    )
                  );

                  const aiModelPromise = AIModel(
                    DiscussionRoomData.topic,
                    DiscussionRoomData.coachingOption,
                    messagesToSend
                  );

                  // Race the AI model against the timeout
                  aiResponse = await Promise.race([
                    aiModelPromise,
                    timeoutPromise,
                  ]);

                  // Robust validation of AI response
                  if (!aiResponse) {
                    console.error("Empty response object from AIModel");
                    aiResponse = {
                      role: "assistant",
                      content:
                        "I apologize, but I'm having trouble connecting with the AI service. Could you please try again in a moment?",
                    };
                    break; // Exit the retry loop with the fallback response
                  }

                  if (!aiResponse.content || aiResponse.content.trim() === "") {
                    console.error("Empty content in AI response");
                    aiResponse = {
                      role: "assistant",
                      content:
                        "I apologize, but I received an empty response from the AI service. Could you please try a different question?",
                    };
                    break; // Exit the retry loop with the fallback response
                  }

                  console.log(
                    "AI response content:",
                    aiResponse.content.substring(0, 100) + "..."
                  );

                  // Verify the AI response is unique and relevant
                  const lastAIResponses = conversationHistory
                    .filter((msg) => msg.role === "assistant")
                    .map((msg) => msg.content);

                  // Check for duplicate responses (exact match)
                  if (lastAIResponses.includes(aiResponse.content)) {
                    console.error(
                      "Duplicate response detected, adding unique identifier"
                    );
                    // Instead of throwing an error, make the response unique
                    const uniqueId = Math.random().toString(36).substring(2, 6);
                    aiResponse.content = aiResponse.content.trim();
                    // Add the unique ID in a way that doesn't affect the visible content
                    aiResponse._uniqueId = uniqueId;
                    // Continue with this response instead of throwing an error
                  }

                  // Also check for high similarity with last response
                  else if (lastAIResponses.length > 0) {
                    const lastResponse =
                      lastAIResponses[lastAIResponses.length - 1];
                    if (
                      lastResponse &&
                      isTooSimilar(lastResponse, aiResponse.content)
                    ) {
                      console.log(
                        "Response similar to previous, adding variation"
                      );
                      // Instead of throwing an error, add a disclaimer to the response
                      const clarification =
                        "\n\nIs there a specific aspect of this you'd like me to explain differently or in more detail?";
                      aiResponse.content =
                        aiResponse.content.trim() + clarification;
                    }
                  }
                } catch (error) {
                  console.error(
                    `AI response attempt ${retryCount + 1} failed:`,
                    error
                  );

                  // If this is an error related to empty completions, provide a fallback immediately
                  if (
                    error.message &&
                    (error.message.includes("Empty completion") ||
                      error.message.includes("completion object") ||
                      error.message.includes("Invalid response format"))
                  ) {
                    console.log(
                      "Detected empty completion error, using fallback response"
                    );
                    aiResponse = {
                      role: "assistant",
                      content:
                        "I apologize, but the AI service is having difficulty processing your request. Let's try something simpler or rephrase your question.",
                    };
                    break; // Exit the retry loop with the fallback response
                  }

                  aiResponse = null; // Reset for retry for other types of errors
                  retryCount++;

                  if (retryCount === maxRetries) {
                    // Create a fallback response if all retries fail
                    aiResponse = {
                      role: "assistant",
                      content: `I apologize, but I'm having trouble generating a response right now (Error: ${error.message}). Could you please try speaking again or asking a different question?`,
                    };
                  }

                  // Wait longer between retries with exponential backoff
                  await new Promise((resolve) =>
                    setTimeout(resolve, 1500 * (retryCount + 1))
                  );
                }
              }

              // If we got here without a valid response, create a fallback
              if (!aiResponse || !aiResponse.content) {
                aiResponse = {
                  role: "assistant",
                  content:
                    "I apologize, but I'm having trouble responding right now. Could you please try again?",
                };
              }

              console.log("Valid AI Response received");

              // Update conversation with AI response
              setConversation((prev) => {
                const newConversation = [...prev, aiResponse];
                // Clean up the conversation
                const cleanedConversation =
                  cleanupConversationArray(newConversation);

                if (DiscussionRoomData?._id) {
                  // Save to database
                  UpdateConversation({
                    id: DiscussionRoomData._id,
                    conversation: cleanedConversation,
                  });
                  // Remove await since we're in a callback function
                  UpdateUserTokenMethod(aiResponse.content);
                }
                return cleanedConversation;
              });

              // Wait a moment before restarting speech recognition
              await new Promise((resolve) => setTimeout(resolve, 800));

              // Restart speech recognition if we still want it to be active
              if (enableMic && !isSpeechRecognitionActive && !isPaused) {
                console.log(
                  "Restarting speech recognition after AI response..."
                );
                if (speechRecognition.current) {
                  try {
                    speechRecognition.current.start();
                  } catch (startError) {
                    console.error(
                      "Error restarting speech recognition:",
                      startError
                    );
                    // Re-initialize if start failed
                    speechRecognition.current = null;
                    initializeSpeechRecognition();
                    if (speechRecognition.current && !isPaused) {
                      speechRecognition.current.start();
                    }
                  }
                }
              }
            } catch (error) {
              console.error("Error in AI response flow:", error);
              // Add a more helpful error message to the conversation
              setConversation((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `I apologize, but I encountered an error: ${error.message}. Please try speaking again or refresh the page if the issue persists.`,
                },
              ]);
            } finally {
              setLoading(false);
              setIsWaitingForAI(false);
            }
          }
        }
      };

      return true;
    }
    return false;
  };

  // Add this helper function to check response similarity
  const isTooSimilar = (str1, str2) => {
    // Skip comparison if either string is missing or they have very different lengths
    if (!str1 || !str2) return false;
    if (Math.abs(str1.length - str2.length) > str1.length * 0.4) return false;

    // Simple similarity check - can be improved with more sophisticated algorithms
    const words1 = str1.toLowerCase().split(/\s+/);
    const words2 = str2.toLowerCase().split(/\s+/);

    // If lengths are very different, they're not similar
    if (
      Math.abs(words1.length - words2.length) >
      Math.min(words1.length, words2.length) * 0.5
    ) {
      return false;
    }

    // If more than 70% of the words are the same, consider it too similar
    const commonWords = words1.filter((word) => words2.includes(word)).length;
    const similarity = commonWords / Math.max(words1.length, words2.length);

    return similarity > 0.7;
  };

  const requestMicrophonePermission = async () => {
    try {
      setLoading(true);

      // First check if we already have permission
      const permissionStatus = await navigator.permissions.query({
        name: "microphone",
      });

      console.log("Microphone permission status:", permissionStatus.state);

      if (permissionStatus.state === "denied") {
        setPermissionError(
          "Microphone access was denied. Please enable it in your browser settings."
        );
        setShowPermissionDialog(true);
        return false;
      }

      // Request microphone access with specific constraints
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      stream.current = audioStream;
      console.log("Microphone access granted successfully");
      return true;
    } catch (err) {
      console.error("Error requesting microphone permission:", err);
      let errorMessage = "Failed to access microphone. ";

      if (err.name === "NotAllowedError") {
        errorMessage +=
          "Please allow microphone access in your browser settings.";
      } else if (err.name === "NotFoundError") {
        errorMessage += "No microphone device found.";
      } else if (err.name === "NotReadableError") {
        errorMessage += "Microphone is already in use by another application.";
      } else {
        errorMessage += err.message || "Please check your browser settings.";
      }

      setPermissionError(errorMessage);
      setShowPermissionDialog(true);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const connectToServer = async () => {
    try {
      // Reset error counter when starting fresh
      setSpeechRecognitionErrors(0);
      setShowRecognitionStatus(false);

      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        setEnableMic(false);
        return;
      }

      setEnableMic(true);
      setLoading(true);
      setShowPermissionDialog(false);
      setIsPaused(false);

      // Initialize speech recognition but don't start it yet
      const speechInitialized = initializeSpeechRecognition();
      if (!speechInitialized) {
        throw new Error("Speech recognition initialization failed");
      }

      // Note: We no longer automatically start speech recognition here
      // Instead, we'll start it when the user clicks "Start Conversation" or "Resume"

      // Wait for RecordRTC to be loaded
      const RecordRTCModule = await import("recordrtc");
      const RecordRTCConstructor = RecordRTCModule.default;

      // Set up recorder but don't start it yet
      recorder.current = new RecordRTCConstructor(stream.current, {
        type: "audio",
        mimeType: "audio/webm;codecs=pcm",
        recorderType: RecordRTCConstructor.StereoAudioRecorder,
        timeSlice: 250,
        desiredSampRate: 16000,
        numberOfAudioChannels: 1,
        bufferSize: 4096,
        audioBitsPerSecond: 128000,
        ondataavailable: async (blob) => {
          if (silenceTimeout.current) {
            clearTimeout(silenceTimeout.current);
          }

          const buffer = await blob.arrayBuffer();
          console.log("Audio data received:", buffer.byteLength, "bytes");

          const transcriptObj = await processAudioBuffer(buffer);

          silenceTimeout.current = setTimeout(() => {
            console.log("User stopped talking");
          }, 2000);
        },
      });

      console.log("Recording setup completed successfully");
    } catch (err) {
      console.error("Error setting up recording:", err);
      setEnableMic(false);
      setPermissionError(err.message || "Failed to set up recording");
      setShowPermissionDialog(true);
    } finally {
      setLoading(false);
    }
  };

  const GenerateFeedbackNotes = async () => {
    setLoading(true);
    try {
      // Clean up the conversation before sending it for feedback
      const cleanedConversation = cleanupConversationArray(conversation);
      console.log(
        `Generating feedback with ${cleanedConversation.length} cleaned messages`
      );

      const feedbackNotes = await AIModelToGenerateFeedbackAndNotes(
        DiscussionRoomData?.topic,
        DiscussionRoomData?.coachingOption,
        cleanedConversation
      );
      console.log(feedbackNotes);

      // Set feedback content to display in the dedicated feedback section
      setFeedbackContent(feedbackNotes.content);

      // Update the feedback in the Convex database
      if (DiscussionRoomData?._id) {
        await UpdateSessionFeedback({
          id: DiscussionRoomData._id,
          sessionFeedback: feedbackNotes.content,
        });
        console.log("Session feedback saved to database successfully");
      }
    } catch (error) {
      console.error("Error generating feedback notes:", error);
      // Display a user-friendly error message in the feedback section
      setFeedbackContent(
        "Sorry, there was an error generating the feedback. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="-mt-12">
      <h2 className="text-lg font-bold">
        {DiscussionRoomData?.coachingOption}
      </h2>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2">
          <div className="h-[60vh] bg-secondary border rounded-4xl flex flex-col items-center justify-center relative">
            <Image
              alt="avatar"
              src={expert?.avatar}
              width={200}
              height={200}
              className={`h-[80px] w-[80px] rounded-full object-cover ${
                isSpeechRecognitionActive && !isWaitingForAI
                  ? "animate-pulse"
                  : ""
              }`}
            />
            {listeningNoSpeech && (
              <div className="absolute top-4 right-4 bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-medium animate-pulse">
                Listening... Speak now
              </div>
            )}
            {showRecognitionStatus && (
              <div className="absolute top-4 left-4 bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-medium">
                Speech recognition error - Auto recovery in progress
                <button
                  className="ml-2 underline"
                  onClick={() => {
                    // Manual reset of speech recognition
                    if (speechRecognition.current) {
                      try {
                        speechRecognition.current.stop();
                      } catch (e) {
                        console.log("Error stopping speech recognition", e);
                      }

                      setTimeout(() => {
                        speechRecognition.current = null;
                        setSpeechRecognitionErrors(0);
                        const success = initializeSpeechRecognition();
                        if (success && speechRecognition.current) {
                          try {
                            speechRecognition.current.start();
                            setShowRecognitionStatus(false);
                          } catch (e) {
                            console.error(
                              "Failed to manually restart speech recognition",
                              e
                            );
                          }
                        }
                      }, 500);
                    }
                  }}
                >
                  Reset
                </button>
              </div>
            )}
            <h2 className="text-gray-500">{expert?.name}</h2>

            {/* <div className="p-5 bg-gray-200 px-10 rounded-lg absolute bottom-10 right-10">
              <UserButton />
            </div> */}
            <div className="absolute bottom-10 right-10">
              <Webcam
                height={100}
                width={150}
                className="p-5  rounded-4xl"
              />
            </div>
          </div>
          <div className="mt-5 flex items-center justify-center gap-4">
            {!enableMic ? (
              <Button onClick={connectToServer} disabled={loading}>
                {loading && <Loader2Icon className="animate-spin mr-2" />}{" "}
                Connect to Expert
              </Button>
            ) : !isStarted ? (
              <>
                <Button onClick={handleStart} disabled={loading}>
                  {loading && <Loader2Icon className="animate-spin mr-2" />}{" "}
                  Start Conversation
                </Button>
                <Button
                  variant="destructive"
                  onClick={disconnectFromServer}
                  disabled={loading}
                >
                  {loading && <Loader2Icon className="animate-spin mr-2" />}{" "}
                  Disconnect
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={handlePauseResume}
                  disabled={loading || isWaitingForAI}
                  className={isPaused ? "bg-yellow-100" : ""}
                >
                  {loading && <Loader2Icon className="animate-spin mr-2" />}{" "}
                  {isPaused ? "Resume" : "Pause"}
                </Button>
                <Button
                  variant="destructive"
                  onClick={disconnectFromServer}
                  disabled={loading}
                >
                  {loading && <Loader2Icon className="animate-spin mr-2" />}{" "}
                  Disconnect
                </Button>
              </>
            )}
          </div>
        </div>

        <div>
          <div className="h-[60vh] bg-secondary border rounded-4xl flex flex-col p-4 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <h2 className="font-bold mb-4">Chat Section</h2>
            <ChatBox
              conversation={conversation}
              DiscussionRoomData={DiscussionRoomData}
            />
          </div>

          {/* Separate Feedback Notes Section */}
          <div className="mt-4">
            {!enableFeedbackNotes ? (
              <h2 className="text-gray-400 text-sm">
                At the end of your conversation we will automatically generate
                feedback/notes from your conversation
              </h2>
            ) : (
              <div>
                {feedbackContent ? (
                  <div className="bg-gray-50 p-3 rounded-lg border max-h-[200px] overflow-y-auto">
                    <h3 className="font-medium text-sm mb-1">
                      Session Feedback & Notes
                    </h3>
                    <div className="text-sm whitespace-pre-line">
                      {feedbackContent}
                    </div>
                  </div>
                ) : (
                  // Check if conversation has at least one user and one assistant message
                  (() => {
                    const hasUserMessage = conversation.some(
                      (msg) => msg.role === "user"
                    );
                    const hasAssistantMessage = conversation.some(
                      (msg) => msg.role === "assistant"
                    );
                    const hasMinimumConversation =
                      hasUserMessage && hasAssistantMessage;

                    return hasMinimumConversation ? (
                      <Button
                        onClick={GenerateFeedbackNotes}
                        disabled={loading}
                        className="w-full"
                      >
                        {loading && (
                          <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Generate Feedback/Notes
                      </Button>
                    ) : (
                      <h2 className="text-gray-400 text-sm">
                        Have a conversation with the assistant first to enable
                        feedback generation
                      </h2>
                    );
                  })()
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transcript Display Section */}
      <div className="mt-8 w-full p-6 bg-white rounded-lg shadow-lg">
        <h2 className="text-xl font-bold mb-4">Transcripts</h2>
        <div className="space-y-3">
          <p>
            {transcripts.map((transcript, index) => (
              <span
                key={index}
                className={
                  transcript.message_type === "partialTranscript"
                    ? "text-gray-400 italic"
                    : "text-black"
                }
              >
                {transcript.text}{" "}
              </span>
            ))}
          </p>
        </div>
      </div>

      {/* Permission Dialog */}
      <Dialog
        open={showPermissionDialog && !enableMic}
        onOpenChange={(open) => {
          if (!open) {
            setShowPermissionDialog(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Microphone Permission Required</DialogTitle>
            <DialogDescription>
              {permissionError ||
                "This application needs access to your microphone to record your voice. Please allow microphone access to continue."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowPermissionDialog(false);
                setEnableMic(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowPermissionDialog(false);
                connectToServer();
              }}
            >
              Try Again
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DiscussionRoom;
