// convex/jobs.ts
import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import schema from "./schema";

const summaryValidator = schema
  .doc("jobs")
  .pick("_id", "title", "company", "location", "source", "postedAt", "url");

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    source: v.optional(schema.tables.jobs.validator.fields.source),
    location: v.optional(v.string()),
    postedAfter: v.optional(v.number()),
  },
  returns: paginationResultValidator(summaryValidator),
  handler: async (ctx, args) => {
    const since = args.postedAfter ?? 0;
    const source = args.source;
    const location = args.location;
    const jobs =
      source !== undefined
        ? location !== undefined
          ? ctx.db
              .query("jobs")
              .withIndex("by_source_and_location_and_postedAt", (q) =>
                q
                  .eq("source", source)
                  .eq("location", location)
                  .gte("postedAt", since),
              )
          : ctx.db
              .query("jobs")
              .withIndex("by_source_and_postedAt", (q) =>
                q.eq("source", source).gte("postedAt", since),
              )
        : location !== undefined
          ? ctx.db
              .query("jobs")
              .withIndex("by_location_and_postedAt", (q) =>
                q.eq("location", location).gte("postedAt", since),
              )
          : ctx.db
              .query("jobs")
              .withIndex("by_postedAt", (q) => q.gte("postedAt", since));
    const result = await jobs.order("desc").paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map(
        ({ _id, title, company, location, source, postedAt, url }) => ({
          _id,
          title,
          company,
          location,
          source,
          postedAt,
          url,
        }),
      ),
    };
  },
});

export const get = query({
  args: { id: v.id("jobs") },
  returns: v.union(schema.doc("jobs"), v.null()),
  handler: async (ctx, { id }) => await ctx.db.get("jobs", id),
});

export const locations = query({
  args: { after: v.optional(v.string()) },
  returns: v.object({
    values: v.array(v.string()),
    next: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { after }) => {
    const values: string[] = [];
    let cursor = after ?? "";
    // Skip directly between distinct locations through the index.
    for (let i = 0; i < 50; i++) {
      const job = await ctx.db
        .query("jobs")
        .withIndex("by_location_and_postedAt", (q) => q.gt("location", cursor))
        .first();
      if (!job) return { values, next: null };
      values.push(job.location);
      cursor = job.location;
    }
    const more = await ctx.db
      .query("jobs")
      .withIndex("by_location_and_postedAt", (q) => q.gt("location", cursor))
      .first();
    return { values, next: more ? cursor : null };
  },
});

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
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("jobs")
      .withIndex("by_source_sourceId", (q) =>
        q.eq("source", args.source).eq("sourceId", args.sourceId),
      )
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch("jobs", existing._id, { ...args, updatedAt: now });
    } else {
      await ctx.db.insert("jobs", {
        ...args,
        scrapedAt: now,
        updatedAt: now,
        status: "new",
      });
    }
    return null;
  },
});
