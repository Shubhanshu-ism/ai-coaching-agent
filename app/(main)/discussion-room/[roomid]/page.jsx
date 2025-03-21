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
  const [recordRTCLoaded, setRecordRTCLoaded] = useState(false);
  const RecordRTCRef = useRef(null);

  const recorder = useRef(null);
  const silenceTimeout = useRef(null);

  // Load RecordRTC properly
  useEffect(() => {
    let isMounted = true;

    if (typeof window !== "undefined") {
      import("recordrtc")
        .then((RecordRTCModule) => {
          if (isMounted) {
            // Store the actual module in the ref
            RecordRTCRef.current = RecordRTCModule.default || RecordRTCModule;
            setRecordRTCLoaded(true);
          }
        })
        .catch((err) => {
          console.error("Error loading RecordRTC:", err);
        });
    }

    return () => {
      isMounted = false;
    };
  }, []);

  // Set expert data when DiscussionRoomData changes
  useEffect(() => {
    if (DiscussionRoomData) {
      const Expert = CoachingExpert.find(
        (item) => item.name == DiscussionRoomData.expertName
      );
      if (Expert) {
        setExpert(Expert);
      }
    }
  }, [DiscussionRoomData]);

  const connectToServer = async () => {
    if (!recordRTCLoaded || !RecordRTCRef.current) {
      console.error("RecordRTC library not loaded yet");
      return;
    }

    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Use the RecordRTC module from our ref
      const RecordRTC = RecordRTCRef.current;

      // Create RecordRTC instance
      recorder.current = new RecordRTC(stream, {
        type: "audio",
        mimeType: "audio/webm;codecs=pcm",
        recorderType: RecordRTC.StereoAudioRecorder,
        timeSlice: 250,
        desiredSampRate: 16000,
        numberOfAudioChannels: 1,
        bufferSize: 4096,
        audioBitsPerSecond: 128000,
        ondataavailable: async (blob) => {
          // Reset the silence detection timer on audio input
          clearTimeout(silenceTimeout.current);

          const buffer = await blob.arrayBuffer();
          console.log(buffer);

          // Restart the silence detection timer
          silenceTimeout.current = setTimeout(() => {
            console.log("User stopped talking");
            // Handle user stopped talking
          }, 2000);
        },
      });

      // Start recording
      recorder.current.startRecording();
      setEnableMic(true);
    } catch (err) {
      console.error("Error connecting to microphone:", err);
    }
  };

  const disconnect = (e) => {
    e.preventDefault();

    if (
      recorder.current &&
      typeof recorder.current.pauseRecording === "function"
    ) {
      recorder.current.pauseRecording();
      recorder.current = null;
    }

    if (silenceTimeout.current) {
      clearTimeout(silenceTimeout.current);
    }

    setEnableMic(false);
  };

  return (
    <div className="-mt-12">
      <h2 className="text-lg font-bold">
        {DiscussionRoomData?.coachingOption}
      </h2>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2">
          <div className=" h-[60vh] bg-secondary border rounded-4xl flex flex-col items-center justify-center relative">
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
              <Button onClick={connectToServer} disabled={!recordRTCLoaded}>
                Connect
              </Button>
            ) : (
              <Button variant="destructive" onClick={disconnect}>
                Disconnect
              </Button>
            )}
          </div>
        </div>

        <div>
          <div className=" h-[60vh] bg-secondary border rounded-4xl flex flex-col items-center justify-center relative">
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
