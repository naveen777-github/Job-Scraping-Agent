// convex/scrapeJobs.ts
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const LINKEDIN_ACTOR = "cheap_scraper~linkedin-job-scraper";
const INDEED_ACTOR = "valig~indeed-jobs-scraper";

const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // freshness filter

// Search Canada for jobs posted in the past week.
const LINKEDIN_SEARCH_URLS = [
  "https://www.linkedin.com/jobs/search/?keywords=full%20stack%20developer&location=Canada&f_TPR=r604800",
];

const TITLE_KEYWORDS = [
  "full stack",
  "fullstack",
  "full-stack",
  "backend",
  "back end",
  "back-end",
  "software developer",
  "software engineer",
  "react",
  "node",
  "typescript",
  "frontend",
  "front end",
];

const TITLE_EXCLUSIONS = [
  "golang",
  "go developer",
  "rust",
  "php",
  ".net",
  "c#",
  "ios",
  "android",
  "mobile",
  "flutter",
  "data scientist",
  "machine learning",
  "ml engineer",
  "sales",
  "recruiter",
  "manager",
  "director",
  "intern",
];

function titlePasses(title: string): boolean {
  const t = title.toLowerCase();
  if (TITLE_EXCLUSIONS.some((kw) => t.includes(kw))) return false;
  return TITLE_KEYWORDS.some((kw) => t.includes(kw));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

async function runActor(
  actorId: string,
  input: unknown,
): Promise<Record<string, unknown>[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is not configured");

  const res = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );

  if (!res.ok) {
    throw new Error(
      `Apify actor ${actorId} failed: ${res.status} ${await res.text()}`,
    );
  }

  const items: unknown = await res.json();
  if (!Array.isArray(items) || !items.every(isRecord)) {
    throw new Error(`Apify actor ${actorId} returned an invalid dataset`);
  }

  console.log(`Actor ${actorId} returned ${items.length} items`);
  if (items.length === 0) {
    console.warn(
      `Apify actor ${actorId} returned an empty dataset before local filtering. Check the run input and logs in Apify Console.`,
    );
  } else {
    console.log("Sample:", JSON.stringify(items[0]).slice(0, 800));
  }
  return items;
}

export const scrapeLinkedIn = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const items = await runActor(LINKEDIN_ACTOR, {
      startUrls: LINKEDIN_SEARCH_URLS.map((url) => ({ url })),
      maxItems: 150, // This actor requires a minimum limit of 150.
      enrichCompanyData: true,
    });

    const counts = {
      received: items.length,
      upserted: 0,
      skippedTitle: 0,
      skippedDate: 0,
      skippedInvalid: 0,
    };
    const now = Date.now();
    for (const job of items) {
      const title = stringValue(job.jobTitle);
      const url = stringValue(job.jobUrl);
      if (!title || !url) {
        counts.skippedInvalid++;
        continue;
      }
      if (!titlePasses(title)) {
        counts.skippedTitle++;
        continue;
      }

      const publishedAt = stringValue(job.publishedAt);
      const postedAt = publishedAt ? Date.parse(publishedAt) : now;
      if (!Number.isFinite(postedAt)) {
        counts.skippedInvalid++;
        continue;
      }
      if (now - postedAt > MAX_AGE_MS) {
        counts.skippedDate++;
        continue;
      }

      await ctx.runMutation(internal.jobs.upsertJob, {
        source: "apify_linkedin",
        sourceId: stringValue(job.jobId) ?? url,
        url,
        title,
        company: stringValue(job.companyName) ?? "Unknown",
        location: stringValue(job.location) ?? "",
        technologies: [],
        description: stringValue(job.jobDescription) ?? "",
        postedAt,
      });
      counts.upserted++;
    }
    console.log("LinkedIn scrape summary:", counts);
    return null;
  },
});

export const scrapeIndeed = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const items = await runActor(INDEED_ACTOR, {
      title: "full stack developer",
      country: "ca",
      location: "Canada",
      limit: 100,
      datePosted: "3",
    });

    const counts = {
      received: items.length,
      upserted: 0,
      skippedTitle: 0,
      skippedDate: 0,
      skippedExpired: 0,
      skippedInvalid: 0,
    };
    const now = Date.now();
    for (const job of items) {
      if (job.expired === true) {
        counts.skippedExpired++;
        continue;
      }

      const title = stringValue(job.title);
      const url = stringValue(job.url) ?? stringValue(job.jobUrl);
      if (!title || !url) {
        counts.skippedInvalid++;
        continue;
      }
      if (!titlePasses(title)) {
        counts.skippedTitle++;
        continue;
      }

      const postingDate =
        stringValue(job.datePublished) ?? stringValue(job.dateOnIndeed);
      const postedAt = postingDate ? Date.parse(postingDate) : now;
      if (!Number.isFinite(postedAt)) {
        counts.skippedInvalid++;
        continue;
      }
      if (now - postedAt > MAX_AGE_MS) {
        counts.skippedDate++;
        continue;
      }

      const employer = isRecord(job.employer) ? job.employer : undefined;
      const description = isRecord(job.description)
        ? stringValue(job.description.text)
        : stringValue(job.description);
      const location = isRecord(job.location)
        ? [
            job.location.city,
            job.location.admin1Code,
            job.location.countryName ?? job.location.countryCode,
          ]
            .map(stringValue)
            .filter((part) => part !== undefined)
            .join(", ")
        : (stringValue(job.location) ?? "");

      await ctx.runMutation(internal.jobs.upsertJob, {
        source: "apify_indeed",
        sourceId: stringValue(job.key) ?? url,
        url,
        title,
        company: stringValue(employer?.name) ?? "Unknown",
        location,
        technologies: [],
        description: description ?? "",
        postedAt,
      });
      counts.upserted++;
    }
    console.log("Indeed scrape summary:", counts);
    return null;
  },
});
