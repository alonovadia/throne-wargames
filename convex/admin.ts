import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

const weapon = v.union(
  v.literal("GREATSWORD"),
  v.literal("DAGGER"),
  v.literal("CROSSBOW"),
  v.literal("LONGBOW"),
  v.literal("STAFF"),
  v.literal("WAND"),
  v.literal("SWORD_AND_SHIELD"),
);

const team = v.union(v.literal("BLUE"), v.literal("RED"));

const participantInput = v.object({
  characterName: v.string(),
  team,
  mainWeapon: weapon,
  offWeapon: weapon,
  kills: v.number(),
  assists: v.number(),
  damageDealt: v.number(),
  healingDone: v.number(),
});
const serverSecretDigest =
  "dda66eb9c552de8acc127f518fd1c7cbcc822c9ed06ecde102032959b8f5aef6";

export async function requireServerSecret(provided: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(provided),
  );
  const actual = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (actual !== serverSecretDigest) {
    throw new Error("Not authorized.");
  }
}

function validateAuditInput(actor: string, reason?: string) {
  if (actor.trim().length < 2 || actor.length > 80) throw new Error("A valid operator name is required.");
  if (reason !== undefined && (reason.trim().length < 2 || reason.length > 500)) {
    throw new Error("A valid reason is required.");
  }
}

export const consumePublicWriteLimit = mutation({
  args: {
    serverSecret: v.string(),
    key: v.string(),
    limit: v.number(),
    windowMs: v.number(),
  },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    if (
      !/^[a-z]+:[a-f0-9]{64}$/.test(args.key) ||
      !Number.isInteger(args.limit) ||
      args.limit < 1 ||
      args.limit > 10_000 ||
      !Number.isInteger(args.windowMs) ||
      args.windowMs < 1_000 ||
      args.windowMs > 7 * 24 * 60 * 60 * 1000
    ) {
      throw new Error("Invalid public write rate limit.");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("publicWriteRateLimits")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + args.windowMs;
      if (existing) {
        await ctx.db.patch(existing._id, { count: 1, resetAt, expiresAt: resetAt });
      } else {
        await ctx.db.insert("publicWriteRateLimits", {
          key: args.key,
          count: 1,
          resetAt,
          expiresAt: resetAt,
        });
      }
      return { allowed: true, retryAfterMs: 0 };
    }

    if (existing.count >= args.limit) {
      return { allowed: false, retryAfterMs: Math.max(1, existing.resetAt - now) };
    }

    await ctx.db.patch(existing._id, { count: existing.count + 1 });
    return { allowed: true, retryAfterMs: 0 };
  },
});

export const recordVisitor = mutation({
  args: {
    serverSecret: v.string(),
    path: v.string(),
    referrer: v.optional(v.string()),
    eventKey: v.string(),
  },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    if (!args.path || args.path.length > 160 || (args.referrer?.length ?? 0) > 200) {
      throw new Error("Invalid visitor event.");
    }
    const existing = await ctx.db
      .query("visitorEvents")
      .withIndex("by_event_key", (q) => q.eq("eventKey", args.eventKey))
      .first();
    if (existing) return;
    const now = Date.now();
    await ctx.db.insert("visitorEvents", {
      path: args.path,
      referrer: args.referrer,
      eventKey: args.eventKey,
      createdAt: now,
      expiresAt: now + 32 * 24 * 60 * 60 * 1000,
    });
  },
});

export const deleteExpiredVisitorEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expiredByTtl = await ctx.db
      .query("visitorEvents")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
      .take(500);
    const legacyExpired = (await ctx.db
      .query("visitorEvents")
      .withIndex("by_created_at", (q) =>
        q.lt("createdAt", now - 32 * 24 * 60 * 60 * 1000),
      )
      .take(500))
      .filter((event) => event.expiresAt === undefined);
    const ids = new Set([...expiredByTtl, ...legacyExpired].map((event) => event._id));
    await Promise.all([...ids].map((id) => ctx.db.delete(id)));
  },
});

export const deleteExpiredPublicWriteRateLimits = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("publicWriteRateLimits")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", Date.now()))
      .take(500);
    await Promise.all(expired.map((entry) => ctx.db.delete(entry._id)));
  },
});

export const summary = query({
  args: { serverSecret: v.string() },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    const now = Date.now();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const weekStart = startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000;
    const [visitors, applications] = await Promise.all([
      ctx.db
        .query("visitorEvents")
        .withIndex("by_created_at", (q) => q.gte("createdAt", weekStart))
        .collect(),
      ctx.db.query("applications").collect(),
    ]);
    const activity = Array.from({ length: 7 }, (_, index) => {
      const dayStart = weekStart + index * 24 * 60 * 60 * 1000;
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      return {
        label: new Date(dayStart).toLocaleDateString("en-US", { weekday: "short" }),
        blue: visitors.filter((event) => event.createdAt >= dayStart && event.createdAt < dayEnd).length,
        red: applications.filter((application) => application.createdAt >= dayStart && application.createdAt < dayEnd).length,
      };
    });
    return {
      visitorsToday: visitors.filter((event) => event.createdAt >= startOfToday.getTime()).length,
      visitorsThisWeek: visitors.length,
      applicationQueue: applications.filter((application) => application.status === "PENDING").length,
      ocrConfidence: null,
      activity,
    };
  },
});

export const applications = query({
  args: { serverSecret: v.string() },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    const rows = await ctx.db.query("applications").order("desc").collect();
    return Promise.all(rows.map((row) => loadApplication(ctx, row)));
  },
});
export const submitApplication = mutation({
  args: {
    serverSecret: v.string(),
    groupName: v.string(),
    captainName: v.string(),
    captainContact: v.string(),
    notes: v.optional(v.string()),
    submissionToken: v.string(),
    members: v.array(
      v.object({
        characterName: v.string(),
        mainWeapon: weapon,
        offWeapon: weapon,
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    if (
      args.groupName.trim().length < 2 || args.groupName.length > 80 ||
      args.captainName.trim().length < 2 || args.captainName.length > 40 ||
      args.captainContact.trim().length < 3 || args.captainContact.length > 120 ||
      (args.notes?.length ?? 0) > 1000 ||
      args.submissionToken.length < 16 || args.submissionToken.length > 100
    ) {
      throw new Error("Invalid roster application.");
    }
    if (args.members.length !== 6) {
      throw new Error("A roster application must contain exactly six players.");
    }
    if (args.members.some((member) =>
      member.characterName.trim().length < 2 || member.characterName.length > 40
    )) {
      throw new Error("Invalid player name.");
    }
    const duplicate = await ctx.db
      .query("applications")
      .withIndex("by_submission_token", (q) =>
        q.eq("submissionToken", args.submissionToken),
      )
      .first();
    if (duplicate) return duplicate._id;
    const applicationId = await ctx.db.insert("applications", {
      groupName: args.groupName.trim(),
      captainName: args.captainName.trim(),
      captainContact: args.captainContact.trim(),
      notes: args.notes?.trim() || undefined,
      submissionToken: args.submissionToken,
      status: "PENDING",
      createdAt: Date.now(),
    });
    for (const member of args.members) {
      const existing = await ctx.db
        .query("players")
        .withIndex("by_character_name", (q) =>
          q.eq("characterName", member.characterName),
        )
        .unique();
      const playerId =
        existing?._id ??
        (await ctx.db.insert("players", {
          characterName: member.characterName.trim(),
          createdAt: Date.now(),
        }));
      await ctx.db.insert("applicationMembers", {
        applicationId,
        playerId,
        mainWeapon: member.mainWeapon,
        offWeapon: member.offWeapon,
      });
    }
    return applicationId;
  },
});

export const commitMatch = mutation({
  args: {
    serverSecret: v.string(),
    screenshotStorageId: v.id("_storage"),
    winningTeam: team,
    matchDate: v.optional(v.number()),
    note: v.optional(v.string()),
    actor: v.string(),
    participants: v.array(
      v.object({
        characterName: v.string(),
        team,
        mainWeapon: weapon,
        offWeapon: weapon,
        kills: v.number(),
        assists: v.number(),
        damageDealt: v.number(),
        healingDone: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    validateAuditInput(args.actor);
    const screenshot = await ctx.db.system.get(args.screenshotStorageId);
    if (!screenshot) {
      throw new Error("The scoreboard screenshot upload could not be found.");
    }
    validateParticipants(args.participants);
    const matchId = await ctx.db.insert("matches", {
      matchDate: args.matchDate ?? Date.now(),
      status: "COMPLETED",
      winningTeam: args.winningTeam,
      screenshotStorageId: args.screenshotStorageId,
      note: args.note,
    });
    for (const participant of args.participants) {
      const existing = await ctx.db
        .query("players")
        .withIndex("by_character_name", (q) =>
          q.eq("characterName", participant.characterName),
        )
        .unique();
      const playerId =
        existing?._id ??
        (await ctx.db.insert("players", {
          characterName: participant.characterName.trim(),
          createdAt: Date.now(),
        }));
      await ctx.db.insert("matchParticipants", {
        matchId,
        playerId,
        team: participant.team,
        isWinner: participant.team === args.winningTeam,
        mainWeapon: participant.mainWeapon,
        offWeapon: participant.offWeapon,
        kills: participant.kills,
        assists: participant.assists,
        damageDealt: participant.damageDealt,
        healingDone: participant.healingDone,
      });
    }
    const committed = await ctx.db.get(matchId);
    await ctx.db.insert("auditRecords", {
      entityType: "MATCH", entityId: String(matchId), action: "MATCH_CREATED",
      actor: args.actor.trim(), after: JSON.stringify(await matchSnapshot(ctx, committed)),
      createdAt: Date.now(),
    });
    return matchId;
  },
});

export const correctMatch = mutation({
  args: {
    serverSecret: v.string(), matchId: v.id("matches"), actor: v.string(), reason: v.string(),
    matchDate: v.number(), winningTeam: team, note: v.string(), participants: v.array(participantInput),
  },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    validateAuditInput(args.actor, args.reason);
    validateParticipants(args.participants);
    const match = await ctx.db.get(args.matchId);
    if (!match || match.status === "PROCESSING") throw new Error("Match not found.");
    if (match.status === "DISCARDED") throw new Error("A discarded match cannot be corrected.");
    const before = await matchSnapshot(ctx, match);
    await ctx.db.patch(args.matchId, {
      matchDate: args.matchDate, winningTeam: args.winningTeam, note: args.note.trim() || undefined,
    });
    await replaceParticipants(ctx, args.matchId, args.winningTeam, args.participants);
    const updated = await ctx.db.get(args.matchId);
    const after = await matchSnapshot(ctx, updated);
    await ctx.db.insert("auditRecords", {
      entityType: "MATCH", entityId: String(args.matchId), action: "MATCH_CORRECTED",
      actor: args.actor.trim(), reason: args.reason.trim(),
      before: JSON.stringify(before), after: JSON.stringify(after), createdAt: Date.now(),
    });
    return loadAdminMatch(ctx, updated);
  },
});
export const generateScoreboardUploadUrl = mutation({
  args: { serverSecret: v.string() },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    return ctx.storage.generateUploadUrl();
  },
});

export const deleteScoreboardUpload = mutation({
  args: {
    serverSecret: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    await ctx.storage.delete(args.storageId);
  },
});

export const scoreboardUrl = query({
  args: {
    serverSecret: v.string(),
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    const match = await ctx.db.get(args.matchId);
    if (!match?.screenshotStorageId || match.status === "PROCESSING") return null;
    return ctx.storage.getUrl(match.screenshotStorageId);
  },
});


async function replaceParticipants(ctx: any, matchId: any, winningTeam: "BLUE" | "RED", participants: any[]) {
  const existingRows = await ctx.db.query("matchParticipants")
    .withIndex("by_match", (q: any) => q.eq("matchId", matchId)).collect();
  await Promise.all(existingRows.map((row: any) => ctx.db.delete(row._id)));
  for (const participant of participants) {
    const normalizedName = participant.characterName.trim();
    const existing = await ctx.db.query("players")
      .withIndex("by_character_name", (q: any) => q.eq("characterName", normalizedName)).unique();
    const playerId = existing?._id ?? await ctx.db.insert("players", {
      characterName: normalizedName, createdAt: Date.now(),
    });
    await ctx.db.insert("matchParticipants", {
      matchId, playerId, team: participant.team, isWinner: participant.team === winningTeam,
      mainWeapon: participant.mainWeapon, offWeapon: participant.offWeapon,
      kills: participant.kills, assists: participant.assists,
      damageDealt: participant.damageDealt, healingDone: participant.healingDone,
    });
  }
}

export const matches = query({
  args: { serverSecret: v.string() },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    const rows = await ctx.db.query("matches").withIndex("by_match_date").order("desc").collect();
    return Promise.all(rows.filter((row) => row.status !== "PROCESSING").map((row) => loadAdminMatch(ctx, row)));
  },
});

export const discardMatch = mutation({
  args: { serverSecret: v.string(), matchId: v.id("matches"), actor: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    validateAuditInput(args.actor, args.reason);
    const match = await ctx.db.get(args.matchId);
    if (!match || match.status === "PROCESSING") throw new Error("Match not found.");
    if (match.status === "DISCARDED") throw new Error("Match is already discarded.");
    const before = await matchSnapshot(ctx, match);
    await ctx.db.patch(args.matchId, { status: "DISCARDED" });
    const after = { ...before, status: "DISCARDED" };
    await ctx.db.insert("auditRecords", {
      entityType: "MATCH", entityId: String(args.matchId), action: "MATCH_DISCARDED",
      actor: args.actor.trim(), reason: args.reason.trim(),
      before: JSON.stringify(before), after: JSON.stringify(after), createdAt: Date.now(),
    });
    return loadAdminMatch(ctx, { ...match, status: "DISCARDED" });
  },
});

export const restoreMatch = mutation({
  args: { serverSecret: v.string(), matchId: v.id("matches"), actor: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    validateAuditInput(args.actor, args.reason);
    const match = await ctx.db.get(args.matchId);
    if (!match || match.status === "PROCESSING") throw new Error("Match not found.");
    if (match.status !== "DISCARDED") throw new Error("Only a discarded match can be restored.");
    const before = await matchSnapshot(ctx, match);
    await ctx.db.patch(args.matchId, { status: "COMPLETED" });
    const after = { ...before, status: "COMPLETED" };
    await ctx.db.insert("auditRecords", {
      entityType: "MATCH", entityId: String(args.matchId), action: "MATCH_RESTORED",
      actor: args.actor.trim(), reason: args.reason.trim(),
      before: JSON.stringify(before), after: JSON.stringify(after), createdAt: Date.now(),
    });
    return loadAdminMatch(ctx, { ...match, status: "COMPLETED" });
  },
});

async function loadApplication(ctx: any, application: any) {
  const rows = await ctx.db
    .query("applicationMembers")
    .withIndex("by_application", (q: any) => q.eq("applicationId", application._id))
    .collect();
  const members = await Promise.all(rows.map(async (row: any) => {
    const player = await ctx.db.get(row.playerId);
    if (!player) throw new Error("Application contains an orphaned player.");
    return {
      playerId: String(row.playerId),
      characterName: player.characterName,
      mainWeapon: row.mainWeapon,
      offWeapon: row.offWeapon,
    };
  }));
  return {
    id: String(application._id),
    groupName: application.groupName,
    captainName: application.captainName,
    captainContact: application.captainContact,
    notes: application.notes ?? "",
    status: application.status,
    createdAt: new Date(application.createdAt).toISOString(),
    members,
    audit: await auditFor(ctx, "APPLICATION", String(application._id)),
  };
}

async function loadAdminMatch(ctx: any, match: any) {
  const snapshot = await matchSnapshot(ctx, match);
  return {
    ...snapshot,
    blueScore: snapshot.participants.filter((row: any) => row.team === "BLUE")
      .reduce((sum: number, row: any) => sum + row.kills, 0),
    redScore: snapshot.participants.filter((row: any) => row.team === "RED")
      .reduce((sum: number, row: any) => sum + row.kills, 0),
    audit: await auditFor(ctx, "MATCH", String(match._id)),
  };
}

function validateParticipants(participants: Array<{
  characterName: string;
  team: "BLUE" | "RED";
  kills: number;
  assists: number;
  damageDealt: number;
  healingDone: number;
}>) {
  if (participants.length !== 12) throw new Error("A completed match must contain twelve participants.");
  if (participants.filter((row) => row.team === "BLUE").length !== 6 ||
      participants.filter((row) => row.team === "RED").length !== 6) {
    throw new Error("A completed match must contain six participants on each team.");
  }
  const normalizedNames = participants.map((row) => row.characterName.trim().toLocaleLowerCase());
  if (new Set(normalizedNames).size !== normalizedNames.length) {
    throw new Error("A completed match cannot contain the same participant more than once.");
  }
  for (const row of participants) {
    if (!row.characterName.trim() || row.characterName.length > 40 ||
        [row.kills, row.assists, row.damageDealt, row.healingDone].some(
          (value) => !Number.isSafeInteger(value) || value < 0,
        )) {
      throw new Error("Every participant needs a valid name and non-negative whole-number statistics.");
    }
  }
}

async function auditFor(ctx: any, entityType: "APPLICATION" | "MATCH", entityId: string) {
  const records = await ctx.db
    .query("auditRecords")
    .withIndex("by_entity", (q: any) => q.eq("entityType", entityType).eq("entityId", entityId))
    .collect();
  return records.sort((a: any, b: any) => b.createdAt - a.createdAt).map((record: any) => ({
    id: String(record._id),
    action: record.action,
    actor: record.actor,
    reason: record.reason ?? "",
    createdAt: new Date(record.createdAt).toISOString(),
  }));
}

async function matchSnapshot(ctx: any, match: any) {
  const rows = await ctx.db.query("matchParticipants")
    .withIndex("by_match", (q: any) => q.eq("matchId", match._id)).collect();
  const participants = await Promise.all(rows.map(async (row: any) => {
    const player = await ctx.db.get(row.playerId);
    if (!player) throw new Error("Match contains an orphaned player.");
    return {
      playerId: String(row.playerId), characterName: player.characterName, team: row.team,
      isWinner: row.isWinner, mainWeapon: row.mainWeapon, offWeapon: row.offWeapon,
      kills: row.kills, assists: row.assists, damageDealt: row.damageDealt, healingDone: row.healingDone,
    };
  }));
  return {
    id: String(match._id), matchDate: new Date(match.matchDate).toISOString(),
    status: match.status, winningTeam: match.winningTeam,
    note: match.note ?? "", hasScreenshot: Boolean(match.screenshotStorageId), participants,
  };
}

export const updateApplicationStatus = mutation({
  args: {
    serverSecret: v.string(),
    applicationId: v.id("applications"),
    status: v.union(v.literal("APPROVED"), v.literal("REJECTED"), v.literal("CANCELLED")),
    actor: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    validateAuditInput(args.actor, args.reason);
    const application = await ctx.db.get(args.applicationId);
    if (!application) throw new Error("Application not found.");
    if (application.status !== "PENDING") throw new Error("Only pending applications can be reviewed.");
    const now = Date.now();
    await ctx.db.patch(args.applicationId, { status: args.status });
    await ctx.db.insert("auditRecords", {
      entityType: "APPLICATION", entityId: String(args.applicationId),
      action: `APPLICATION_${args.status}` as "APPLICATION_APPROVED" | "APPLICATION_REJECTED" | "APPLICATION_CANCELLED",
      actor: args.actor.trim(), reason: args.reason.trim(),
      before: JSON.stringify({ status: application.status }),
      after: JSON.stringify({ status: args.status }), createdAt: now,
    });
    return loadApplication(ctx, { ...application, status: args.status });
  },
});
