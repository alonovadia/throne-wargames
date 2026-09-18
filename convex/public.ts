import { query } from "./_generated/server";
import { v } from "convex/values";

const round = (value: number) => Math.round(value * 10) / 10;
const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

async function loadMatch(ctx: any, match: any) {
  const rows = await ctx.db
    .query("matchParticipants")
    .withIndex("by_match", (q: any) => q.eq("matchId", match._id))
    .collect();
  const participants = await Promise.all(
    rows.map(async (row: any) => {
      const player = await ctx.db.get(row.playerId);
      if (!player) {
        throw new Error(`Match ${String(match._id)} contains an orphaned participant.`);
      }
      return {
        playerId: String(row.playerId),
        characterName: player.characterName,
        team: row.team,
        isWinner: row.isWinner,
        mainWeapon: row.mainWeapon,
        offWeapon: row.offWeapon,
        kills: row.kills,
        assists: row.assists,
        damageDealt: row.damageDealt,
        healingDone: row.healingDone,
      };
    }),
  );
  return {
    id: String(match._id),
    matchDate: new Date(match.matchDate).toISOString(),
    winningTeam: match.winningTeam,
    blueScore: participants
      .filter((participant: any) => participant.team === "BLUE")
      .reduce((sum: number, participant: any) => sum + participant.kills, 0),
    redScore: participants
      .filter((participant: any) => participant.team === "RED")
      .reduce((sum: number, participant: any) => sum + participant.kills, 0),
    hasScreenshot: Boolean(match.screenshotStorageId),
    note: match.note ?? "",
    participants,
  };
}

async function loadMatches(ctx: any, limit?: number) {
  const rows = await ctx.db
    .query("matches")
    .withIndex("by_match_date")
    .order("desc")
    .collect();
  const completed = rows.filter(
    (match: any) => match.status === "COMPLETED" && match.winningTeam,
  );
  return Promise.all(
    (limit === undefined ? completed : completed.slice(0, limit)).map((match: any) =>
      loadMatch(ctx, match),
    ),
  );
}

function buildPlayerSummaries(matches: any[]) {
  const grouped = new Map<string, any[]>();
  for (const match of matches) {
    for (const participant of match.participants) {
      const current = grouped.get(participant.playerId) ?? [];
      current.push({ ...participant, match });
      grouped.set(participant.playerId, current);
    }
  }
  return [...grouped.entries()].map(([id, entries]) => {
    const ordered = [...entries].sort(
      (left, right) => Date.parse(right.match.matchDate) - Date.parse(left.match.matchDate),
    );
    const latest = ordered[0];
    const wins = entries.filter((entry) => entry.isWinner).length;
    return {
      id,
      characterName: latest.characterName,
      archetype: `${latest.mainWeapon} / ${latest.offWeapon}`,
      matches: entries.length,
      wins,
      winRate: round((wins / entries.length) * 100),
      avgKills: round(average(entries.map((entry) => entry.kills))),
      avgDamage: round(average(entries.map((entry) => entry.damageDealt))),
      form: ordered.slice(0, 5).map((entry) => entry.isWinner ? "W" : "L").join(" "),
    };
  });
}

function buildClassSummaries(matches: any[]) {
  const grouped = new Map<string, any[]>();
  for (const match of matches) {
    for (const participant of match.participants) {
      const key = `${participant.mainWeapon}:${participant.offWeapon}`;
      const current = grouped.get(key) ?? [];
      current.push({ ...participant, match });
      grouped.set(key, current);
    }
  }
  return [...grouped.entries()].map(([id, entries]) => {
    const ordered = [...entries].sort(
      (left, right) => Date.parse(right.match.matchDate) - Date.parse(left.match.matchDate),
    );
    const midpoint = Math.ceil(ordered.length / 2);
    const recent = ordered.slice(0, midpoint);
    const earlier = ordered.slice(midpoint);
    const winRate = (sample: any[]) =>
      sample.length ? (sample.filter((entry) => entry.isWinner).length / sample.length) * 100 : 0;
    return {
      id,
      mainWeapon: entries[0].mainWeapon,
      offWeapon: entries[0].offWeapon,
      totalMatches: new Set(entries.map((entry) => entry.match.id)).size,
      winRate: round(winRate(entries)),
      avgKills: round(average(entries.map((entry) => entry.kills))),
      avgAssists: round(average(entries.map((entry) => entry.assists))),
      avgDamage: round(average(entries.map((entry) => entry.damageDealt))),
      avgHealing: round(average(entries.map((entry) => entry.healingDone))),
      trend: round(winRate(recent) - winRate(earlier)),
    };
  });
}

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const [matches, applications] = await Promise.all([
      loadMatches(ctx),
      ctx.db
        .query("applications")
        .withIndex("by_status", (q) => q.eq("status", "PENDING"))
        .collect(),
    ]);
    const recent = matches.slice(0, 6);
    return {
      totalMatches: matches.length,
      totalPlayers: buildPlayerSummaries(matches).length,
      activeApplications: applications.length,
      averageMatchLength: null,
      latestMatch: matches[0] ?? null,
      momentum: [...recent].reverse().map((match, index) => ({
        label: `M${index + 1}`,
        blue: match.blueScore,
        red: match.redScore,
      })),
    };
  },
});

export const leaderboards = query({
  args: {},
  handler: async (ctx) => {
    const matches = await loadMatches(ctx);
    return {
      classes: buildClassSummaries(matches),
      players: buildPlayerSummaries(matches),
    };
  },
});

export const players = query({
  args: { search: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const summaries = buildPlayerSummaries(await loadMatches(ctx));
    const search = args.search?.trim().toLowerCase();
    return summaries
      .filter((player) =>
        search
          ? `${player.characterName} ${player.archetype}`.toLowerCase().includes(search)
          : true,
      )
      .slice(0, args.limit ?? 20);
  },
});

export const player = query({
  args: { playerId: v.string() },
  handler: async (ctx, args) => {
    const matches = await loadMatches(ctx);
    const summary = buildPlayerSummaries(matches).find((entry) => entry.id === args.playerId);
    if (!summary) return null;
    const entries = matches.flatMap((match) =>
      match.participants
        .filter((participant: any) => participant.playerId === args.playerId)
        .map((participant: any) => ({ ...participant, match })),
    );
    const record = (label: string, selector: (entry: any) => number) => {
      const best = [...entries].sort((left, right) => selector(right) - selector(left))[0];
      return best ? { label, value: selector(best), achievedAt: best.match.matchDate } : null;
    };
    const records = [
      record("Most kills", (entry) => entry.kills),
      record("Highest damage", (entry) => entry.damageDealt),
      record("Most assists", (entry) => entry.assists),
    ].filter(Boolean);
    const weaponBreakdown = buildClassSummaries(matches).filter((benchmark) =>
      entries.some(
        (entry) =>
          entry.mainWeapon === benchmark.mainWeapon &&
          entry.offWeapon === benchmark.offWeapon,
      ),
    );
    return {
      ...summary,
      avgAssists: round(average(entries.map((entry) => entry.assists))),
      avgHealing: round(average(entries.map((entry) => entry.healingDone))),
      records,
      weaponBreakdown,
    };
  },
});

export const matches = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => loadMatches(ctx, args.limit ?? 10),
});

export const matchById = query({
  args: { matchId: v.id("matches") },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match || match.status !== "COMPLETED" || !match.winningTeam) return null;
    return loadMatch(ctx, match);
  },
});