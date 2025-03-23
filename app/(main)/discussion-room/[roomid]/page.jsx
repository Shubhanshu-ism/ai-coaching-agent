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
  const recorder = useRef(null);
  const stream = useRef(null);
  const silenceTimeout = useRef(null);
  const [expert, setExpert] = useState({
    name: "Sallie",
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

  const connectToServer = async () => {
    try {
      setEnableMic(true);
      if (typeof window !== "undefined" && typeof navigator !== "undefined") {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.current = audioStream;

        // Wait for RecordRTC to be loaded
        const RecordRTCModule = await import("recordrtc");
        const RecordRTCConstructor = RecordRTCModule.default;

        recorder.current = new RecordRTCConstructor(audioStream, {
          type: "audio",
          mimeType: "audio/webm;codecs=pcm",
          recorderType: RecordRTCConstructor.StereoAudioRecorder,
          timeSlice: 250,
          desiredSampRate: 16000,
          numberOfAudioChannels: 1,
          bufferSize: 4096,
          audioBitsPerSecond: 128000,
          ondataavailable: async (blob) => {
            // Reset the silence detection timer on audio input
            if (silenceTimeout.current) {
              clearTimeout(silenceTimeout.current);
            }

            const buffer = await blob.arrayBuffer();
            console.log("Audio data received:", buffer.byteLength, "bytes");
            console.log(buffer);
            // Restart the silence detection timer
            silenceTimeout.current = setTimeout(() => {
              console.log("User stopped talking");
              // Handle user stopped talking (e.g., send final transcript, stop recording, etc.)
            }, 2000);
          },
        });

        // Start recording
        await recorder.current.startRecording();
        console.log("Recording started");
      }
    } catch (err) {
      console.error("Error starting recording:", err);
      setEnableMic(false);
    }
  };

  const disconnectFromServer = async (e) => {
    e.preventDefault();
    try {
      if (recorder.current) {
        await recorder.current.stopRecording(() => {
          const blob = recorder.current.getBlob();
          console.log("Recording stopped, blob size:", blob.size);
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
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectFromServer({ preventDefault: () => {} });
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
              <Button onClick={connectToServer}>Connect to Expert</Button>
            ) : (
              <Button variant="destructive" onClick={disconnectFromServer}>
                Disconnect
              </Button>
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
    </div>
  );
}

export default DiscussionRoom;
