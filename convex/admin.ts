import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

const weapon = v.string();

const team = v.union(v.literal("BLUE"), v.literal("RED"), v.literal("YELLOW"));

const participantInput = v.object({
  characterName: v.string(),
  team,
  mainWeapon: weapon,
  offWeapon: weapon,
  kills: v.number(),
  assists: v.number(),
  damageDealt: v.number(),
  damageTaken: v.number(),
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

const seedClasses = [
  ["GREATSWORD", "Greatsword", ["greatsword", "great sword", "gs"]],
  ["DAGGER", "Dagger", ["dagger", "daggers"]],
  ["CROSSBOW", "Crossbow", ["crossbow", "cross bow", "xbow"]],
  ["LONGBOW", "Longbow", ["longbow", "long bow", "bow"]],
  ["SWORD_AND_SHIELD", "Sword and Shield", ["sword and shield", "sword & shield", "swordshield", "sns"]],
  ["WAND", "Wand", ["wand"]],
  ["STAFF", "Staff", ["staff"]],
] as const;

function normalizeClassKey(value: string) {
  return value.trim().toUpperCase().replace(/[\s-]+/g, "_");
}
function normalizeAliases(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}
async function ensureSeedClasses(ctx: any) {
  const existing = await ctx.db.query("classCatalog").collect();
  for (const [key, displayName, aliases] of seedClasses) {
    if (!existing.some((row: any) => row.key === key)) {
      await ctx.db.insert("classCatalog", {
        key, displayName, aliases: [...aliases],
        active: true, sortOrder: seedClasses.findIndex((item) => item[0] === key),
        createdAt: Date.now(), updatedAt: Date.now(),
      });
    }
  }
}
function classView(row: any) {
  return { key: row.key, displayName: row.displayName, aliases: row.aliases,
    active: row.active, sortOrder: row.sortOrder,
    createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString() };
}
async function requireActiveClasses(ctx: any, values: string[], allowedInactive = new Set<string>()) {
  const rows = await ctx.db.query("classCatalog").collect();
  const active = new Set((rows.length ? rows.filter((row: any) => row.active).map((row: any) => row.key) : seedClasses.map(([key]) => key)));
  for (const value of values) if (!active.has(value) && !allowedInactive.has(value)) {
    throw new Error(`Class "${value}" is not active in the class catalog.`);
  }
}

export const classes = query({
  args: { serverSecret: v.string(), includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    const rows = await ctx.db.query("classCatalog").collect();
    if (!rows.length) return seedClasses.map(([key, displayName, aliases], sortOrder) => ({
      key, displayName, aliases: [...aliases], active: true, sortOrder,
      createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
    }));
    return rows.filter((row) => args.includeInactive || row.active).sort((a, b) => a.sortOrder - b.sortOrder).map(classView);
  },
});
export const createClass = mutation({
  args: { serverSecret: v.string(), key: v.string(), displayName: v.string(), aliases: v.array(v.string()), sortOrder: v.optional(v.number()), actor: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret); validateAuditInput(args.actor, args.reason);
    await ensureSeedClasses(ctx);
    const key = normalizeClassKey(args.key); const displayName = args.displayName.trim();
    if (!/^[A-Z0-9][A-Z0-9_]*$/.test(key) || !displayName) throw new Error("Invalid class key or display name.");
    if (await ctx.db.query("classCatalog").withIndex("by_key", (q) => q.eq("key", key)).first()) throw new Error("A class with this key already exists.");
    const now = Date.now(); const id = await ctx.db.insert("classCatalog", { key, displayName, aliases: normalizeAliases(args.aliases), active: true, sortOrder: args.sortOrder ?? 100, createdAt: now, updatedAt: now });
    await ctx.db.insert("auditRecords", { entityType: "CLASS", entityId: key, action: "CLASS_CREATED", actor: args.actor.trim(), reason: args.reason.trim(), createdAt: now });
    return classView(await ctx.db.get(id));
  },
});
export const updateClass = mutation({
  args: { serverSecret: v.string(), key: v.string(), displayName: v.optional(v.string()), aliases: v.optional(v.array(v.string())), active: v.optional(v.boolean()), sortOrder: v.optional(v.number()), actor: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret); validateAuditInput(args.actor, args.reason);
    await ensureSeedClasses(ctx);
    const row = await ctx.db.query("classCatalog").withIndex("by_key", (q) => q.eq("key", args.key)).first();
    if (!row) throw new Error("Class not found.");
    const patch: any = { updatedAt: Date.now() };
    if (args.displayName !== undefined) patch.displayName = args.displayName.trim();
    if (args.aliases !== undefined) patch.aliases = normalizeAliases(args.aliases);
    if (args.active !== undefined) patch.active = args.active;
    if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;
    await ctx.db.patch(row._id, patch);
    await ctx.db.insert("auditRecords", { entityType: "CLASS", entityId: row.key, action: args.active === false ? "CLASS_DISABLED" : args.active === true ? "CLASS_ENABLED" : "CLASS_UPDATED", actor: args.actor.trim(), reason: args.reason.trim(), before: JSON.stringify(classView(row)), after: JSON.stringify({ ...classView(row), ...patch, updatedAt: new Date(patch.updatedAt).toISOString() }), createdAt: Date.now() });
    return classView({ ...row, ...patch });
  },
});
export const deleteClass = mutation({
  args: { serverSecret: v.string(), key: v.string(), actor: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret); validateAuditInput(args.actor, args.reason);
    await ensureSeedClasses(ctx);
    const row = await ctx.db.query("classCatalog").withIndex("by_key", (q) => q.eq("key", args.key)).first();
    if (!row) throw new Error("Class not found.");
    if (row.active) throw new Error("Disable the class before deleting it.");
    const [members, participants] = await Promise.all([
      ctx.db.query("applicationMembers").withIndex("by_main_class", (q) => q.eq("mainWeapon", row.key)).collect(),
      ctx.db.query("matchParticipants").withIndex("by_main_class", (q) => q.eq("mainWeapon", row.key)).collect(),
    ]);
    const [memberOff, participantOff] = await Promise.all([
      ctx.db.query("applicationMembers").withIndex("by_off_class", (q) => q.eq("offWeapon", row.key)).collect(),
      ctx.db.query("matchParticipants").withIndex("by_off_class", (q) => q.eq("offWeapon", row.key)).collect(),
    ]);
    if (members.length || participants.length || memberOff.length || participantOff.length) throw new Error("This class is referenced by historical records and cannot be deleted.");
    await ctx.db.delete(row._id);
    await ctx.db.insert("auditRecords", { entityType: "CLASS", entityId: row.key, action: "CLASS_DELETED", actor: args.actor.trim(), reason: args.reason.trim(), before: JSON.stringify(classView(row)), createdAt: Date.now() });
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
    await requireActiveClasses(ctx, args.members.flatMap((member) => [member.mainWeapon, member.offWeapon]));
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
        damageTaken: v.number(),
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
    await requireActiveClasses(ctx, args.participants.flatMap((participant) => [participant.mainWeapon, participant.offWeapon]));
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
        damageTaken: participant.damageTaken,
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
    const historicalRows = await ctx.db.query("matchParticipants")
      .withIndex("by_match", (q: any) => q.eq("matchId", args.matchId)).collect();
    const historicalClasses = new Set(historicalRows.flatMap((row: any) => [row.mainWeapon, row.offWeapon]));
    await requireActiveClasses(ctx, args.participants.flatMap((participant) => [participant.mainWeapon, participant.offWeapon]), historicalClasses);
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


async function replaceParticipants(ctx: any, matchId: any, winningTeam: "BLUE" | "RED" | "YELLOW", participants: any[]) {
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
      damageDealt: participant.damageDealt, damageTaken: participant.damageTaken,
      healingDone: participant.healingDone,
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
    yellowScore: snapshot.participants.filter((row: any) => row.team === "YELLOW")
      .reduce((sum: number, row: any) => sum + row.kills, 0),
    audit: await auditFor(ctx, "MATCH", String(match._id)),
  };
}

function validateParticipants(participants: Array<{
  characterName: string;
  team: "BLUE" | "RED" | "YELLOW";
  kills: number;
  assists: number;
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
}>) {
  if (participants.length < 2 || participants.length > 96) {
    throw new Error("A completed match must contain two teams with no more than 48 participants each.");
  }
  const teamCounts = new Map<string, number>();
  for (const participant of participants) {
    teamCounts.set(participant.team, (teamCounts.get(participant.team) ?? 0) + 1);
  }
  if (teamCounts.size !== 2 || [...teamCounts.values()].some((count) => count < 1 || count > 48)) {
    throw new Error("A completed match must contain exactly two teams with between one and 48 participants each.");
  }
  const normalizedNames = participants.map((row) => row.characterName.trim().toLocaleLowerCase());
  if (new Set(normalizedNames).size !== normalizedNames.length) {
    throw new Error("A completed match cannot contain the same participant more than once.");
  }
  for (const row of participants) {
    if (!row.characterName.trim() || row.characterName.length > 40 ||
        [row.kills, row.assists, row.damageDealt, row.damageTaken, row.healingDone].some(
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
      kills: row.kills, assists: row.assists, damageDealt: row.damageDealt,
      damageTaken: row.damageTaken ?? 0, healingDone: row.healingDone,
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
