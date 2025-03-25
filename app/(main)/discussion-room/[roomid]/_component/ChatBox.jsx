import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowDown } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

function ChatBox({ conversation, DiscussionRoomData }) {
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const UpdateSummary = useMutation(api.DiscussionRoom.UpdateSessionFeedback);

  // Filter out any messages that are marked as feedback summaries
  const filteredConversation = conversation.filter(
    (message) => !message.isFeedbackSummary
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsAutoScroll(true);
    setShowScrollButton(false);
  };

  const handleScroll = () => {
    const container = chatContainerRef.current;
    if (!container) return;

    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      100;

    setIsAutoScroll(isAtBottom);
    setShowScrollButton(!isAtBottom);
  };

  useEffect(() => {
    if (isAutoScroll) {
      scrollToBottom();
    }
  }, [filteredConversation]); // Use filtered conversation for dependency

  const formatMessage = (content) => {
    // Check if content is undefined or null
    if (!content) return "";

    // First split by line breaks
    return content.split("\n").map((line, lineIndex) => {
      // Then process bold text within each line
      const formattedLine = line
        .split(/(\*\*.*?\*\*)/)
        .map((part, partIndex) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            // Remove the ** and make the text bold
            return (
              <span key={`${lineIndex}-${partIndex}`} className="font-bold">
                {part.slice(2, -2)}
              </span>
            );
          }
          return part;
        });

      // Return the line with a line break if it's not the last line
      return (
        <React.Fragment key={lineIndex}>
          {formattedLine}
          {lineIndex < content.split("\n").length - 1 && <br />}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="relative h-full">
      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex flex-col space-y-4 h-full overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {filteredConversation.map((message, index) => (
          <div
            key={index}
            className={`flex ${
              message.role !== "user" ? "justify-start" : "justify-end"
            }`}
          >
            <div
              className={`max-w-[80%] mt-3 rounded-lg p-3 ${
                message.role === "user"
                  ? "bg-primary text-white"
                  : "bg-gray-200 text-gray-900"
              }`}
            >
              <p className="text-sm whitespace-pre-line">
                {formatMessage(message.content)}
              </p>
              <span className="text-xs text-gray-500 mt-1 block">
                {message.role === "user" ? "You" : "Assistant"}
              </span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {showScrollButton && (
        <Button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 rounded-full p-2 h-10 w-10 shadow-lg"
          variant="secondary"
        >
          <ArrowDown className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}

export default ChatBox;
