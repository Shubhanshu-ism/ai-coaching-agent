"use client";
import React from "react";
import { useParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import Image from "next/image";
import { CoachingOption } from "@/services/Options";
import moment from "moment";
import ChatBox from "../../discussion-room/[roomid]/_component/ChatBox";
import SummaryBox from "../_component/SummaryBox";
function ViewSummary() {
  const { roomid } = useParams();
  const DiscussionRoomData = useQuery(api.DiscussionRoom.GetDiscussionRoom, {
    id: roomid,
  });
  console.log(DiscussionRoomData);
  const GetAbstractImage = (option) => {
    const coachingOption = CoachingOption.find((item) => item.name === option);
    return coachingOption?.abstract ?? "/ab1.png";
  };

  return (
    <div className="-mt-10">
      <div className="flex justify-between items-end">
        <div className="flex  gap-7 items-center">
          <Image
            src={GetAbstractImage(DiscussionRoomData?.coachingOption)}
            alt="image"
            width={100}
            height={100}
            className="w-[70px] h-[70px] rounded-full"
          />
          <div>
            <h2 className="font-bold text-2xl">{DiscussionRoomData?.topic}</h2>
            <h2 className=" text-gray-400">
              {DiscussionRoomData?.coachingOption}
            </h2>
          </div>
        </div>

        <h2 className="text-sm text-gray-400">
          {moment(DiscussionRoomData?._creationTime).fromNow()}{" "}
        </h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mt-5">
        <div className="col-span-3">
          <h2 className="text-lg font-bold mb-6">Summary of Your Session</h2>
          <SummaryBox summary={DiscussionRoomData?.sessionFeedback} />
        </div>
        <div className=" col-span-2">
          <h2 className="text-lg font-bold mb-6">Your Conversation</h2>
          <div className=" bg-secondary border rounded-2xl  p-4 h-[60vh] overflow-auto ">
            {DiscussionRoomData?.conversation && (
              <ChatBox
                conversation={DiscussionRoomData?.conversation}
                DiscussionRoomData={DiscussionRoomData}
                enableFeedback={false}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ViewSummary;
