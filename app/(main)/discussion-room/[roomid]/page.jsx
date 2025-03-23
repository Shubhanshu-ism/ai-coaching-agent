"use client";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { CoachingExpert } from "@/services/Options";
import { UserButton } from "@stackframe/stack";
import { useQuery } from "convex/react";
import Image from "next/image";
import { useParams } from "next/navigation";
import React, { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { AIModel } from "@/services/GlobalServices";
import { Loader2Icon } from "lucide-react";
import ChatBox from "./_component/ChatBox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Import RecordRTC with proper configuration
const RecordRTC = dynamic(
  () => import("recordrtc").then((mod) => mod.default),
  {
    ssr: false,
  }
);

function DiscussionRoom() {
  const { roomid } = useParams();
  const DiscussionRoomData = useQuery(api.DiscussionRoom.GetDiscussionRoom, {
    id: roomid,
  });
  const [enableMic, setEnableMic] = useState(false);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [permissionError, setPermissionError] = useState("");
  const recorder = useRef(null);
  const stream = useRef(null);
  const silenceTimeout = useRef(null);
  const speechRecognition = useRef(null);
  const [transcripts, setTranscripts] = useState([]);
  const [conversation, setConversation] = useState([
    { role: "assistant", content: "Hi" },
    { role: "user", content: "Hello" },
  ]);
  const [loading, setLoading] = useState(false);
  const [expert, setExpert] = useState({
    name: "Salli",
    avatar: "/t2.jpg",
  });

  useEffect(() => {
    if (DiscussionRoomData) {
      const Expert = CoachingExpert.find(
        (item) => item.name === DiscussionRoomData.expertName
      );
      setExpert(Expert);
    }
  }, [DiscussionRoomData]);

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
    // Check if browser supports SpeechRecognition
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.error("Speech recognition not supported in this browser");
        return false;
      }

      speechRecognition.current = new SpeechRecognition();
      speechRecognition.current.continuous = true;
      speechRecognition.current.interimResults = true;
      speechRecognition.current.lang = "en-US";

      speechRecognition.current.onresult = async (event) => {
        let interimTranscript = "";
        let finalTranscript = "";
        let confidence = 0;

        // Process the results
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

        // Generate words array (simplified version)
        const generateWords = (text) => {
          if (!text) return [];
          return text.split(" ").map((word, index) => ({
            word,
            start: now - text.length * 50 + index * 50, // Rough estimate
            end: now - text.length * 50 + (index + 1) * 50,
            confidence,
          }));
        };

        // Handle interim results
        if (interimTranscript) {
          const partialResult = {
            message_type: "partialTranscript",
            text: interimTranscript,
            words: generateWords(interimTranscript),
            audioStart: now - 1000, // Approximate
            audioEnd: now,
            created: new Date().toISOString(),
            confidence,
            text_formatted: interimTranscript,
          };

          // console.log("Partial transcript:", partialResult);
          setTranscripts((prev) => [
            ...prev.filter((t) => t.message_type !== "partialTranscript"),
            partialResult,
          ]);
        }

        // Handle final results
        if (finalTranscript) {
          const finalResult = {
            message_type: "finalTranscript",
            text: finalTranscript,
            words: generateWords(finalTranscript),
            audioStart: now - 2000, // Approximate
            audioEnd: now,
            created: new Date().toISOString(),
            confidence,
            text_formatted: finalTranscript,
          };

          // console.log("Final transcript:", finalResult);
          setTranscripts((prev) => [
            ...prev.filter((t) => t.message_type !== "partialTranscript"),
            finalResult,
          ]);

          // Add the final transcript to the conversation as a user message
          setConversation((prev) => [
            ...prev,
            { role: "user", content: finalResult.text },
          ]);
          //Calling AI Model
          
          const aiResponse = await AIModel(
            DiscussionRoomData.topic,
            DiscussionRoomData.coachingOption,
            finalResult.text
          );
          console.log(aiResponse);
          setConversation((prev) => [...prev, aiResponse]);
        }
      };

      speechRecognition.current.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
      };

      return true;
    }
    return false;
  };

  const requestMicrophonePermission = async () => {
    try {
      setLoading(true);

      // First check if we already have permission
      const permissionStatus = await navigator.permissions.query({
        name: "microphone",
      });

      if (permissionStatus.state === "denied") {
        setPermissionError(
          "Microphone access was denied. Please enable it in your browser settings."
        );
        setShowPermissionDialog(true);
        return false;
      }

      // Request microphone access
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      stream.current = audioStream;
      return true;
    } catch (err) {
      console.error("Error requesting microphone permission:", err);
      setPermissionError(
        err.message ||
          "Failed to access microphone. Please check your browser settings."
      );
      setShowPermissionDialog(true);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const connectToServer = async () => {
    try {
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        setEnableMic(false);
        return;
      }

      setEnableMic(true);
      setLoading(true);
      setShowPermissionDialog(false); // Hide dialog when permission is granted

      // Initialize speech recognition
      const speechInitialized = initializeSpeechRecognition();
      if (speechInitialized) {
        speechRecognition.current.start();
      }

      // Wait for RecordRTC to be loaded
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
        ondataavailable: async (blob) => {
          if (silenceTimeout.current) {
            clearTimeout(silenceTimeout.current);
          }

          const buffer = await blob.arrayBuffer();
          // console.log("Audio data received:", buffer.byteLength, "bytes");

          const transcriptObj = await processAudioBuffer(buffer);

          silenceTimeout.current = setTimeout(() => {
            console.log("User stopped talking");
          }, 2000);
        },
      });

      await recorder.current.startRecording();
      console.log("Recording started");
    } catch (err) {
      console.error("Error starting recording:", err);
      setEnableMic(false);
      setPermissionError(err.message || "Failed to start recording");
      setShowPermissionDialog(true);
    } finally {
      setLoading(false);
    }
  };

  const disconnectFromServer = async (e) => {
    setLoading(true);
    if (e && e.preventDefault) e.preventDefault();
    try {
      if (speechRecognition.current) {
        speechRecognition.current.stop();
        speechRecognition.current = null;
      }

      if (recorder.current) {
        await recorder.current.stopRecording(() => {
          const blob = recorder.current.getBlob();
          // console.log("Recording stopped, blob size:", blob.size);
          recorder.current = null;
        });
      }
      if (stream.current) {
        stream.current.getTracks().forEach((track) => track.stop());
        stream.current = null;
      }
      if (silenceTimeout.current) {
        clearTimeout(silenceTimeout.current);
        silenceTimeout.current = null;
      }
      setEnableMic(false);
    } catch (err) {
      console.error("Error stopping recording:", err);
    }
    setLoading(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectFromServer();
    };
  }, []);

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
              className="h-[80px] w-[80px] rounded-full object-cover animate-pulse"
            />
            <h2 className="text-gray-500">{expert?.name}</h2>

            <div className="p-5 bg-gray-200 px-10 rounded-lg absolute bottom-10 right-10">
              <UserButton />
            </div>
          </div>
          <div className="mt-5 flex items-center justify-center">
            {!enableMic ? (
              <Button onClick={connectToServer} disabled={loading}>
                {loading && <Loader2Icon className="animate-spin mr-2" />}{" "}
                Connect to Expert
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={disconnectFromServer}
                disabled={loading}
              >
                {loading && <Loader2Icon className="animate-spin mr-2" />}{" "}
                Disconnect
              </Button>
            )}
          </div>
        </div>

        <div>
          <div className="h-[60vh] bg-secondary border rounded-4xl flex flex-col p-4 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <h2 className="font-bold mb-4">Chat Section</h2>
            <ChatBox conversation={conversation} />
          </div>
          <h2 className="mt-3 text-gray-400 text-sm">
            At the end of your conversation we will automatically generate
            feedback/notes from your conversation
          </h2>
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
