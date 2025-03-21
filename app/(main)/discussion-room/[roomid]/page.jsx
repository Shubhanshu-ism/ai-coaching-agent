"use client";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { CoachingExpert } from "@/services/Options";
import { UserButton } from "@stackframe/stack";
import { useQuery } from "convex/react";
import Image from "next/image";
import { useParams } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";

function DiscussionRoom() {
  const { roomid } = useParams();
  const DiscussionRoomData = useQuery(api.DiscussionRoom.GetDiscussionRoom, {
    id: roomid,
  });
  const [enableMic, setEnableMic] = useState(false);
  const [expert, setExpert] = useState({ name: "Sallie", avatar: "/t2.jpg" });
  const [error, setError] = useState(null);
  const [transcribe, setTranscribe] = useState("");
  const [conversation, setConversation] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const recognition = useRef(null);
  const stream = useRef(null);

  // Initialize Web Speech API
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognition.current = new SpeechRecognition();
        recognition.current.continuous = true;
        recognition.current.interimResults = true;
        recognition.current.lang = "en-US";

        recognition.current.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map((result) => result[0].transcript)
            .join("");

          if (event.results[0].isFinal) {
            setConversation((prev) => [
              ...prev,
              {
                role: "user",
                content: transcript,
              },
            ]);
            setTranscribe((prev) => prev + " " + transcript);
          } else {
            // Update interim results
            setTranscribe((prev) => {
              const words = prev.split(" ");
              words[words.length - 1] = transcript;
              return words.join(" ");
            });
          }
        };

        recognition.current.onerror = (event) => {
          console.error("Speech recognition error:", event.error);
          setError(`Speech recognition error: ${event.error}`);
        };

        recognition.current.onend = () => {
          if (isRecording) {
            recognition.current.start();
          }
        };
      } else {
        setError("Speech recognition is not supported in this browser");
      }
    }
  }, [isRecording]);

  // Set expert data when DiscussionRoomData changes
  useEffect(() => {
    if (DiscussionRoomData) {
      const Expert = CoachingExpert.find(
        (item) => item.name === DiscussionRoomData.expertName
      );
      if (Expert) {
        setExpert(Expert);
      }
    }
  }, [DiscussionRoomData]);

  // Cleanup function
  const cleanup = async () => {
    try {
      if (recognition.current) {
        recognition.current.stop();
      }
      if (stream.current) {
        stream.current.getTracks().forEach((track) => track.stop());
        stream.current = null;
      }
      setIsRecording(false);
      setEnableMic(false);
    } catch (err) {
      console.error("Error during cleanup:", err);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const startRecording = async () => {
    try {
      setError(null);
      if (!recognition.current) {
        throw new Error("Speech recognition is not supported");
      }

      // Get microphone access
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      // Start speech recognition
      recognition.current.start();
      setIsRecording(true);
      setEnableMic(true);
    } catch (err) {
      console.error("Error starting recording:", err);
      setError(err.message || "Failed to start recording");
      await cleanup();
    }
  };

  const toggleMic = async () => {
    if (enableMic) {
      await cleanup();
    } else {
      await startRecording();
    }
  };

  return (
    <div className="flex flex-col h-screen">
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
            <div className="mt-5 flex items-center justify-center gap-4">
              {!enableMic ? (
                <Button onClick={toggleMic} disabled={isRecording}>
                  Start Recording
                </Button>
              ) : (
                <Button variant="destructive" onClick={toggleMic}>
                  Stop Recording
                </Button>
              )}
              {isRecording && (
                <div className="text-red-500 animate-pulse">Recording...</div>
              )}
            </div>
          </div>

          <div>
            <div className="h-[60vh] bg-secondary border rounded-4xl flex flex-col items-center justify-center relative">
              <h2>Chat Section</h2>
            </div>
            <h2 className="mt-3 text-gray-400 text-sm">
              At the end of your conversation we will automatically generate
              feedback/notes from your conversation
            </h2>
          </div>
        </div>
        <div className="mt-5">
          <h2>{transcribe}</h2>
        </div>
      </div>
      {error && (
        <div
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
          role="alert"
        >
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}
    </div>
  );
}

export default DiscussionRoom;
