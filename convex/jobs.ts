// convex/jobs.ts
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const upsertJob = internalMutation({
  args: {
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
    technologies: v.array(v.string()),
    description: v.string(),
    postedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("jobs")
      .withIndex("by_source_sourceId", (q) =>
        q.eq("source", args.source).eq("sourceId", args.sourceId),
      )
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
    } else {
      await ctx.db.insert("jobs", {
        ...args,
        scrapedAt: now,
        updatedAt: now,
        status: "new",
      });
    }
  },
});
