import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireServerSecret } from "./admin";

export const snapshot = query({
  args: {
    serverSecret: v.string(),
    marker: v.string(),
  },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    const [applications, matches, players] = await Promise.all([
      ctx.db.query("applications").collect(),
      ctx.db.query("matches").collect(),
      ctx.db.query("players").collect(),
    ]);
    const application = applications.find((row) => row.groupName === args.marker);
    const match = matches.find((row) => row.note === args.marker);
    const applicationMembers = application
      ? await ctx.db
          .query("applicationMembers")
          .withIndex("by_application", (q) => q.eq("applicationId", application._id))
          .collect()
      : [];
    const matchParticipants = match
      ? await ctx.db
          .query("matchParticipants")
          .withIndex("by_match", (q) => q.eq("matchId", match._id))
          .collect()
      : [];
    const playerNames = new Map(players.map((player) => [String(player._id), player.characterName]));
    return {
      application: application
        ? {
            id: String(application._id),
            status: application.status,
            members: applicationMembers.map((member) => ({
              characterName: playerNames.get(String(member.playerId)) ?? null,
              mainWeapon: member.mainWeapon,
              offWeapon: member.offWeapon,
            })),
          }
        : null,
      match: match
        ? {
            id: String(match._id),
            status: match.status,
            hasScreenshot: Boolean(match.screenshotStorageId),
            participants: matchParticipants.map((participant) => ({
              characterName: playerNames.get(String(participant.playerId)) ?? null,
              team: participant.team,
              kills: participant.kills,
            })),
          }
        : null,
    };
  },
});

export const cleanup = mutation({
  args: {
    serverSecret: v.string(),
    marker: v.string(),
  },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    const [applications, matches, players] = await Promise.all([
      ctx.db.query("applications").collect(),
      ctx.db.query("matches").collect(),
      ctx.db.query("players").collect(),
    ]);
    const ownedApplications = applications.filter((row) => row.groupName === args.marker);
    const ownedMatches = matches.filter((row) => row.note === args.marker);
    const ownedPlayers = players.filter((row) => row.characterName.startsWith(`${args.marker}-`));
    const ownedEntityIds = new Set([
      ...ownedApplications.map((row) => String(row._id)),
      ...ownedMatches.map((row) => String(row._id)),
    ]);
    const auditRecords = (await ctx.db.query("auditRecords").collect())
      .filter((row) => ownedEntityIds.has(row.entityId));

    for (const application of ownedApplications) {
      const members = await ctx.db
        .query("applicationMembers")
        .withIndex("by_application", (q) => q.eq("applicationId", application._id))
        .collect();
      for (const member of members) await ctx.db.delete(member._id);
      await ctx.db.delete(application._id);
    }
    for (const match of ownedMatches) {
      const participants = await ctx.db
        .query("matchParticipants")
        .withIndex("by_match", (q) => q.eq("matchId", match._id))
        .collect();
      for (const participant of participants) await ctx.db.delete(participant._id);
      if (match.screenshotStorageId) await ctx.storage.delete(match.screenshotStorageId);
      await ctx.db.delete(match._id);
    }
    for (const player of ownedPlayers) {
      const [matchRows, applicationRows] = await Promise.all([
        ctx.db
          .query("matchParticipants")
          .withIndex("by_player", (q) => q.eq("playerId", player._id))
          .collect(),
        ctx.db.query("applicationMembers").collect(),
      ]);
      if (
        matchRows.length === 0 &&
        !applicationRows.some((row) => row.playerId === player._id)
      ) {
        await ctx.db.delete(player._id);
      }
    }
    for (const auditRecord of auditRecords) await ctx.db.delete(auditRecord._id);
    return {
      applications: ownedApplications.length,
      matches: ownedMatches.length,
      players: ownedPlayers.length,
    };
  },
});