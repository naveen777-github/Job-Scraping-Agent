// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  jobs: defineTable({
    source: v.union(
      v.literal("greenhouse"),
      v.literal("lever"),
      v.literal("ashby"),
      v.literal("remoteok"),
      v.literal("apify_linkedin"),
      v.literal("apify_indeed"),
    ),
    sourceId: v.string(),
    url: v.string(),
    title: v.string(),
    company: v.string(),
    location: v.string(),
    workMode: v.optional(
      v.union(v.literal("remote"), v.literal("hybrid"), v.literal("onsite")),
    ),
    employmentType: v.optional(
      v.union(
        v.literal("full_time"),
        v.literal("part_time"),
        v.literal("contract"),
        v.literal("internship"),
        v.literal("temporary"),
      ),
    ),
    technologies: v.array(v.string()),
    salaryMin: v.optional(v.number()),
    salaryMax: v.optional(v.number()),
    salaryCurrency: v.optional(v.string()),
    description: v.string(),
    postedAt: v.number(),
    scrapedAt: v.number(),
    updatedAt: v.number(),
    status: v.union(
      v.literal("new"),
      v.literal("processing"),
      v.literal("matched"),
      v.literal("skipped"),
      v.literal("failed"),
    ),
    skipReason: v.optional(
      v.union(
        v.literal("title"),
        v.literal("technology"),
        v.literal("date"),
        v.literal("location"),
        v.literal("already_applied"),
        v.literal("other"),
      ),
    ),
    filterDetails: v.optional(v.string()),
  })
    .index("by_source_sourceId", ["source", "sourceId"]) // dedupe/upsert on scrape
    .index("by_status", ["status"]) // pull "new" jobs for matching
    .index("by_postedAt", ["postedAt"])
    .index("by_source_and_postedAt", ["source", "postedAt"])
    .index("by_location_and_postedAt", ["location", "postedAt"])
    .index("by_source_and_location_and_postedAt", [
      "source",
      "location",
      "postedAt",
    ]),

  matches: defineTable({
    jobId: v.id("jobs"),
    userId: v.string(),
    score: v.number(),
    reasoning: v.string(),
    emailed: v.boolean(),
    emailedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_jobId", ["jobId"])
    .index("by_emailed", ["emailed"])
    .index("by_userId_score", ["userId", "score"]),

  applications: defineTable({
    jobId: v.id("jobs"),
    userId: v.string(),
    status: v.union(
      v.literal("not_applied"),
      v.literal("applied"),
      v.literal("interviewing"),
      v.literal("offer"),
      v.literal("rejected"),
      v.literal("withdrawn"),
    ),
    appliedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_jobId", ["jobId"])
    .index("by_userId_status", ["userId", "status"]),
});
