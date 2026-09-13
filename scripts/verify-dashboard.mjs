import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const config = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = config.match(/^VITE_CONVEX_URL=(\S+)/m)?.[1];
assert.ok(url, "VITE_CONVEX_URL must identify the backend to verify");
const client = new ConvexHttpClient(url);

async function listAll(filters = {}) {
  let cursor = null;
  const jobs = [];
  for (let page = 0; page < 100; page++) {
    const result = await client.query(api.jobs.list, {
      ...filters, paginationOpts: { numItems: 25, cursor },
    });
    jobs.push(...result.page);
    if (result.isDone) return jobs;
    assert.notEqual(result.continueCursor, cursor, "Pagination must advance");
    cursor = result.continueCursor;
  }
  throw new Error("Verification exceeded its 100-page read limit");
}

const jobs = await listAll();
assert.ok(jobs.length > 0, "The saved-job library should contain existing scraper results");
assert.equal(new Set(jobs.map(job => job._id)).size, jobs.length, "Pages must not repeat jobs");
assert.ok(jobs.every((job, i) => i === 0 || jobs[i - 1].postedAt >= job.postedAt), "Jobs must be newest first");
assert.ok(jobs.every(job => !Object.hasOwn(job, "description")), "List pages should not transfer full descriptions");

const location = jobs.find(job => job.location === "Toronto, ON, Canada")?.location || jobs[0].location;
const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
let filterChecks = 0;
for (const source of [undefined, "apify_indeed"]) {
  for (const selectedLocation of [undefined, location]) {
    for (const postedAfter of [undefined, cutoff]) {
      const filters = {
        ...(source ? { source } : {}),
        ...(selectedLocation !== undefined ? { location: selectedLocation } : {}),
        ...(postedAfter ? { postedAfter } : {}),
      };
      const actual = await listAll(filters);
      const expected = jobs.filter(job => (!source || job.source === source)
        && (selectedLocation === undefined || job.location === selectedLocation)
        && (!postedAfter || job.postedAt >= postedAfter));
      assert.deepEqual(actual.map(job => job._id).sort(), expected.map(job => job._id).sort(), `Filter combination failed: ${JSON.stringify(filters)}`);
      filterChecks++;
    }
  }
}
assert.deepEqual(await listAll({ location: "__dashboard_verification_no_such_location__" }), []);

let after;
const locations = [];
for (let page = 0; page < 100; page++) {
  const result = await client.query(api.jobs.locations, after ? { after } : {});
  locations.push(...result.values);
  if (result.next === null) break;
  assert.notEqual(result.next, after);
  after = result.next;
  assert.ok(page < 99, "Location pagination exceeded its read limit");
}
assert.deepEqual(locations, [...new Set(jobs.map(job => job.location).filter(Boolean))].sort());

const detail = await client.query(api.jobs.get, { id: jobs[0]._id });
assert.ok(detail);
assert.equal(detail.title, jobs[0].title);
assert.equal(typeof detail.description, "string");
assert.ok(/^https?:\/\//.test(detail.url), "A real job should have a usable application link");
console.log(`PASS: ${jobs.length} saved jobs, newest-first pagination without duplicates, ${filterChecks} filter combinations, empty results, ${locations.length} location options, and job details/application links.`);
