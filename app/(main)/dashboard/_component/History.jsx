"use client"
import React, { useContext, useEffect, useState } from 'react'
import { useConvex } from 'convex/react'
import { UserContext } from '@/app/_context/UserContext'
import { api } from '@/convex/_generated/api'
import { CoachingOption } from '@/services/Options'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import moment from 'moment'
import Link from 'next/link'
function History() {
  const convex = useConvex();
  const { userData } = useContext(UserContext)
  
  useEffect(() => {
    userData && GetDiscussionRoom()
  }, [userData])
  const [discussionRoomList, setDiscussionRoomList] = useState([])
  const GetDiscussionRoom = async () => {
    const result = await convex.query(api.DiscussionRoom.GetAllDiscussionRoom, {
      userId: userData._id,
    })
    setDiscussionRoomList(result)
  }
  const GetAbstractImage = (option) => {
     const coachingOption = CoachingOption.find(item => item.name === option)
     return coachingOption?.abstract??'/ab1.png'
  }

  return (
    <div>
      <h2 className="font-bold text-xl">Your Previous Lecture</h2>
      {discussionRoomList.length > 0 ? (
        <div className="mt-5 ">
          {discussionRoomList.map(
            (item, index) =>
              (item.coachingOption === "Topic Lecture" ||
                item.coachingOption === "Learn Language" ||
                item.coachingOption === "Meditation Guide") && (
                <div
                  key={index}
                  className="border-b-[1px] pb-3 mb-4 group flex justify-between items-center cursor-pointer"
                >
                  <div className="flex items-center gap-7">
                    <Image
                      src={GetAbstractImage(item.coachingOption)}
                      alt="abstract"
                      width={70}
                      height={70}
                      className="rounded-full h-[50px] w-[50px]"
                    />
                    <div>
                      <h2 className="font-bold">{item.topic}</h2>
                      <h2 className=" text-gray-400">{item.coachingOption}</h2>
                      <h2 className="text-sm text-gray-400">
                        {moment(item._creationTime).fromNow()}{" "}
                      </h2>
                    </div>
                  </div>
                  <Link href={`/view-summary/${item._id}`}>
                    <Button
                      variant="outline"
                      className="invisible group-hover:visible"
                  >
                    View Notes
                  </Button>
                  </Link>
                </div>
              )
          )}
        </div>
      ) : (
        <h2 className="text-gray-400">Your don't have any history</h2>
      )}
    </div>
  );
}

export default History