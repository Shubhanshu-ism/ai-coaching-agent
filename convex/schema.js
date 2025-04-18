import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    credits: v.number(),
    subcriptionId: v.optional(v.string()),
  }),
  DiscussionRoom: defineTable({
    coachingOption: v.string(),
    topic: v.string(),
    expertName: v.string(),
    conversation: v.optional(v.any()),
    sessionFeedback: v.optional(v.any()),
    userId: v.optional(v.id("users") ),
  })
});