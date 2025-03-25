import React, { useContext } from 'react'
import { UserContext } from '@/app/_context/UserContext'
import Image from 'next/image'
import { useUser } from '@stackframe/stack'
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Wallet } from 'lucide-react'
function Credits() {
    const {userData} = useContext(UserContext)
    const user=useUser()
  return (
    <div>
        <div className='flex items-center gap-5'>
            <Image src={user?.profileImageUrl} alt='profile' width={60} height={60}
            className='rounded-full'
             />
             <div>
                <h2 className='text-lg font-bold'>{user?.displayName}</h2>
                <h2 className='text-sm text-gray-500'>{user?.primaryEmail}</h2>
             </div>
        </div>
        <hr className='my-5'/>
        <div>
            <h2 className=' font-bold'>Token Usage</h2>
            <h2 className=''>{userData?.credits}/{userData?.subcriptionId? "50,000" : " 5000"}</h2>
            <Progress value={userData?.credits} max={userData?.subcriptionId? 50000 : 5000} className='my-4'/>
            <div className='flex justify-between items-center mt-3'>
                <h2 className='font-bold '>Current Plan</h2>
                <h2 className='p-1 bg-secondary rounded-lg px-2'>
                    {userData?.subcriptionId? "Paid Plan" : "Free Plan"}
                    </h2>
            </div>
            <div className='flex justify-between items-center mt-5 p-5 border rounded-2xl'>
                <div>
                    <h2 className='font-bold'>Upgrade to Pro</h2>
                    <h2 className='text-sm text-gray-500'> 50,000 Tokens</h2>
                </div>
                <h2 className='font-bold'>$10/Month</h2>
            </div>
            <hr className='my-5'/>
            <Button className='w-full'>
                <Wallet className='w-4 h-4 mr-2'/>
                <h2 className='font-bold'>Upgrade $10</h2>
            </Button>
        </div>
    </div>
  )
}

export default Credits