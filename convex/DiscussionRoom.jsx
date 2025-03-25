import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const CreateNewRoom = mutation({
  args: {
    coachingOption: v.string(),
    topic: v.string(),
    expertName: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db.insert("DiscussionRoom", {
      coachingOption: args.coachingOption,
      topic: args.topic,
      expertName: args.expertName,
      userId: args.userId,
    });
    return result;
  },
});

export const GetDiscussionRoom = query({
  args: {
    id: v.id("DiscussionRoom"),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db.get(args.id);
    return result;
  },
});
export const UpdateConversation = mutation({
  args: {
    id: v.id("DiscussionRoom"),
    conversation: v.any(),
  },
  handler: async (ctx, args) => {
    // Directly replace the conversation instead of appending it
    await ctx.db.patch(args.id, {
      conversation: args.conversation,
    });
  },
});
export const UpdateSessionFeedback = mutation({
  args: {
    id: v.id("DiscussionRoom"),
    sessionFeedback: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      sessionFeedback: args.sessionFeedback,
    });
  },
});
