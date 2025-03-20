import React from 'react'
import { Textarea } from "@/components/ui/textarea";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function UserInputDialog({children, coachingOption}) {
  return (
    <Dialog>
      <DialogTrigger>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle> {coachingOption.name} </DialogTitle>
          <DialogDescription asChild>
            <div className="mt-3">
              <h2 className='text-black mt-5'>
                Enter the topic you want to master in {coachingOption.name}
              </h2>
              <Textarea placeholder="Enter your topic here" className='mt-2'/>
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}

export default UserInputDialog