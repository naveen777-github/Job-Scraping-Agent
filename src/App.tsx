import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";

const sources: Record<Doc<"jobs">["source"], string> = {
  apify_linkedin: "LinkedIn",
  apify_indeed: "Indeed",
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  remoteok: "Remote OK",
};
const day = 24 * 60 * 60 * 1000;
const dateFormat = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function dateLabel(value: number) {
  return Number.isFinite(value)
    ? dateFormat.format(new Date(value))
    : "Date unavailable";
}

function safeLink(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function Icon({
  name,
  size = 18,
}: {
  name: "briefcase" | "pin" | "arrow" | "calendar" | "close" | "filter";
  size?: number;
}) {
  const paths = {
    briefcase: (
      <>
        <rect x="3" y="7" width="18" height="14" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a22 22 0 0 0 18 0M10 13h4" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    arrow: <path d="M7 17 17 7M7 7h10v10" />,
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4M17 3v4M3 11h18" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

class DashboardBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="error-state" role="alert">
        <h2>We couldn’t load your jobs.</h2>
        <p>Check your connection and try again.</p>
        <button
          className="primary-button"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}

export default function App() {
  return (
    <>
      <header className="app-header">
        <div className="header-inner">
          <a className="brand" href="/" aria-label="Jobboard home">
            <span className="brand-mark">
              <Icon name="briefcase" size={21} />
            </span>
            jobboard
            <span className="brand-divider" />{" "}
            <span className="brand-section">Your opportunities</span>
          </a>
          <span className="header-note">Your personal job library</span>
        </div>
      </header>
      <main>
        <DashboardBoundary>
          <Dashboard />
        </DashboardBoundary>
      </main>
      <footer className="app-footer">
        Saved from LinkedIn, Indeed, and your connected job sources.
      </footer>
    </>
  );
}

function Dashboard() {
  const [source, setSource] = useState<Doc<"jobs">["source"] | "">("");
  const [location, setLocation] = useState("");
  const [days, setDays] = useState("all");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const args = {
    ...(source ? { source } : {}),
    ...(location ? { location } : {}),
    ...(days !== "all" ? { postedAfter: now - Number(days) * day } : {}),
  };
  const filtered = source !== "" || location !== "" || days !== "all";
  const reset = () => {
    setSource("");
    setLocation("");
    setDays("all");
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">JOB LIBRARY</span>
          <h1>
            Saved jobs<span className="heading-period">.</span>
          </h1>
          <p>Find the opportunities worth your next application.</p>
        </div>
        <span className="sync-label">Updates automatically</span>
      </div>
      <section className="filter-bar" aria-label="Filter saved jobs">
        <div className="filter-intro">
          <Icon name="filter" />
          <span>Filter jobs</span>
        </div>
        <label className="filter-field">
          <span>Source</span>
          <select
            value={source}
            onChange={(event) => setSource(event.target.value as typeof source)}
          >
            <option value="">All sources</option>
            {Object.entries(sources).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field location-field">
          <span>Location</span>
          <select
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          >
            <option value="">All locations</option>
            <LocationOptions />
          </select>
        </label>
        <label className="filter-field">
          <span>Posted</span>
          <select
            value={days}
            onChange={(event) => setDays(event.target.value)}
          >
            <option value="all">Any time</option>
            <option value="1">Past 24 hours</option>
            <option value="3">Past 3 days</option>
            <option value="7">Past 7 days</option>
            <option value="14">Past 14 days</option>
            <option value="30">Past 30 days</option>
          </select>
        </label>
        <button className="reset-button" disabled={!filtered} onClick={reset}>
          Reset
        </button>
      </section>
      <JobsWorkspace
        key={`${source}|${location}|${days}`}
        args={args}
        filtered={filtered}
        reset={reset}
        now={now}
      />
    </>
  );
}

function LocationOptions({ after }: { after?: string }) {
  const result = useQuery(api.jobs.locations, after ? { after } : {});
  return (
    <>
      {result?.values.map((value) => (
        <option key={value} value={value}>
          {value}
        </option>
      ))}
      {result?.next && <LocationOptions after={result.next} />}
    </>
  );
}

function JobsWorkspace({
  args,
  filtered,
  reset,
  now,
}: {
  args: {
    source?: Doc<"jobs">["source"];
    location?: string;
    postedAfter?: number;
  };
  filtered: boolean;
  reset: () => void;
  now: number;
}) {
  const { results, status, loadMore } = usePaginatedQuery(api.jobs.list, args, {
    initialNumItems: 25,
  });
  const [selectedId, setSelectedId] = useState<Id<"jobs"> | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const activeId = results.some((job) => job._id === selectedId)
    ? selectedId
    : (results[0]?._id ?? null);
  useEffect(() => {
    if (mobileOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [mobileOpen]);
  const selectJob = (id: Id<"jobs">) => {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 850px)").matches) setMobileOpen(true);
  };
  if (status === "LoadingFirstPage")
    return (
      <div
        className="loading-workspace"
        role="status"
        aria-label="Loading jobs"
      >
        {[0, 1, 2].map((i) => (
          <div className="skeleton-card" key={i}>
            <div />
            <div />
            <div />
          </div>
        ))}
      </div>
    );
  if (!results.length)
    return (
      <section className="empty-state">
        <span className="empty-icon">
          <Icon name="briefcase" size={30} />
        </span>
        <h2>
          {filtered
            ? "No jobs match these filters"
            : "Your job library is empty"}
        </h2>
        <p>
          {filtered
            ? "Try another location or a wider date range."
            : "Jobs will appear here when your scrapers save new results."}
        </p>
        {filtered && (
          <button className="primary-button" onClick={reset}>
            Clear filters
          </button>
        )}
        {status === "CanLoadMore" && (
          <button className="secondary-button" onClick={() => loadMore(25)}>
            Continue loading
          </button>
        )}
      </section>
    );
  return (
    <>
      <div className="results-heading" aria-live="polite">
        <p>
          <strong>{results.length}</strong>{" "}
          {status === "Exhausted" ? "jobs" : "jobs loaded"}
          {filtered ? " matching your filters" : " in your library"}
        </p>
        <span>Newest first</span>
      </div>
      <div className="workspace">
        <section className="job-list" aria-label="Saved job results">
          {results.map((job) => (
            <button
              key={job._id}
              className={`job-card ${activeId === job._id ? "selected" : ""}`}
              onClick={() => selectJob(job._id)}
              aria-pressed={activeId === job._id}
              aria-label={`View ${job.title} at ${job.company}`}
            >
              <span className="card-top">
                <span className="company-avatar">
                  {job.company.slice(0, 2).toUpperCase()}
                </span>
                <span className="company-name">{job.company}</span>
                <span className={`source-badge ${job.source}`}>
                  {sources[job.source]}
                </span>
              </span>
              <span className="job-title">{job.title}</span>
              <span className="job-location">
                <Icon name="pin" size={15} />
                {job.location || "Location not specified"}
              </span>
              <span className="card-bottom">
                <span>
                  <Icon name="calendar" size={14} />
                  {dateLabel(job.postedAt)}
                </span>
                {now - job.postedAt >= 0 && now - job.postedAt < day && (
                  <span className="new-badge">Posted today</span>
                )}
                <span className="view-label">
                  View details <span aria-hidden="true">→</span>
                </span>
              </span>
            </button>
          ))}
          {status !== "Exhausted" && (
            <button
              className="load-more"
              disabled={status === "LoadingMore"}
              onClick={() => loadMore(25)}
            >
              {status === "LoadingMore"
                ? "Loading more jobs…"
                : "Load more jobs"}
            </button>
          )}
        </section>
        <aside className="desktop-detail" aria-label="Selected job details">
          <JobDetails id={activeId} />
        </aside>
      </div>
      <dialog
        ref={dialog}
        className="mobile-detail"
        onCancel={() => setMobileOpen(false)}
        onClose={() => setMobileOpen(false)}
        aria-label="Job details"
      >
        <button
          className="close-detail"
          aria-label="Close job details"
          onClick={() => setMobileOpen(false)}
        >
          <Icon name="close" />
        </button>
        {mobileOpen && <JobDetails id={activeId} />}
      </dialog>
    </>
  );
}

function JobDetails({ id }: { id: Id<"jobs"> | null }) {
  const job = useQuery(api.jobs.get, id ? { id } : "skip");
  if (job === undefined)
    return (
      <div className="detail-loading" role="status">
        Loading job details…
      </div>
    );
  if (job === null)
    return (
      <div className="detail-loading">This job is no longer available.</div>
    );
  const url = safeLink(job.url);
  return (
    <article className="detail-card">
      <div className="detail-header">
        <div className="detail-kicker">
          <span className={`source-badge ${job.source}`}>
            {sources[job.source]}
          </span>
          <span>JOB DETAILS</span>
        </div>
        <h2>{job.title}</h2>
        <p className="detail-company">{job.company}</p>
        <p className="detail-location">
          <Icon name="pin" size={16} />
          {job.location || "Location not specified"}
        </p>
        {url ? (
          <a
            className="apply-button"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            View & apply on {sources[job.source]}
            <Icon name="arrow" />
          </a>
        ) : (
          <p className="missing-link">
            An application link is not available for this job.
          </p>
        )}
        <p className="external-note">
          Opens the original job listing in a new tab.
        </p>
      </div>
      <dl className="job-facts">
        <div>
          <dt>Posted</dt>
          <dd>{dateLabel(job.postedAt)}</dd>
        </div>
        <div>
          <dt>Saved</dt>
          <dd>{dateLabel(job.scrapedAt)}</dd>
        </div>
      </dl>
      <section className="description-section">
        <h3>About the role</h3>
        <div className="job-description">
          {job.description.trim() ||
            "No description was provided. Open the original listing for more details."}
        </div>
      </section>
    </article>
  );
}
