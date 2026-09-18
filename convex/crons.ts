import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly(
  "delete expired anonymous visitor events",
  { minuteUTC: 15 },
  internal.admin.deleteExpiredVisitorEvents,
);

crons.hourly(
  "delete expired public write rate limits",
  { minuteUTC: 30 },
  internal.admin.deleteExpiredPublicWriteRateLimits,
);

export default crons;