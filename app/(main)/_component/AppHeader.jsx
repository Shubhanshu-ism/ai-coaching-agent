import { UserButton } from '@stackframe/stack'
import Image from 'next/image'
import React from 'react'

function AppHeader() {
  return (
    <div className="p-3 shadow-sm flex justify-between items-center">
      <Image src={"/geminiCoachingLogo.svg"} alt="logo" width={150} height={100} />
      <UserButton />
    </div>
  );
}

export default AppHeader