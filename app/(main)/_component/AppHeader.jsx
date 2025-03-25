import { UserButton } from "@stackframe/stack";
import Image from "next/image";
import Link from "next/link";
import React from "react";

function AppHeader() {
  return (
    <div className="p-3 shadow-sm flex justify-between items-center">
      <Link href="/dashboard">
        <Image
          src={"/geminiCoachingLogo.svg"}
          alt="logo"
          width={150}
          height={100}
          className="cursor-pointer"
        />
      </Link>
      <UserButton />
    </div>
  );
}

export default AppHeader;
