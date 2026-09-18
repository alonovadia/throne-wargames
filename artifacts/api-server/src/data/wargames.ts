import type { Request } from "express";

export type Weapon = string;
export type TeamColor = "BLUE" | "RED";
export type ClassCatalogEntry = { key: string; displayName: string; aliases: string[]; active: boolean; sortOrder: number; createdAt: string; updatedAt: string };
const fallbackClassSeeds: ReadonlyArray<readonly [string, string, readonly string[]]> = [
  ["GREATSWORD", "Greatsword", ["greatsword", "great sword", "gs"]],
  ["DAGGER", "Dagger", ["dagger", "daggers"]],
  ["CROSSBOW", "Crossbow", ["crossbow", "cross bow", "xbow"]],
  ["LONGBOW", "Longbow", ["longbow", "long bow", "bow"]],
  ["SWORD_AND_SHIELD", "Sword and Shield", ["sword and shield", "sword & shield", "swordshield", "sns"]],
  ["WAND", "Wand", ["wand"]],
  ["STAFF", "Staff", ["staff"]],
];
const classCatalog: ClassCatalogEntry[] = fallbackClassSeeds.map(([key, displayName, aliases], sortOrder) => ({
  key,
  displayName,
  aliases: aliases as string[],
  active: true,
  sortOrder,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
}));
export const getClasses = () => classCatalog.filter((entry) => entry.active);

export type MatchParticipant = {
  playerId: string;
  characterName: string;
  team: TeamColor;
  isWinner: boolean;
  mainWeapon: Weapon;
  offWeapon: Weapon;
  kills: number;
  assists: number;
  damageDealt: number;
  healingDone: number;
};

export type MatchSummary = {
  id: string;
  matchDate: string;
  winningTeam: TeamColor;
  blueScore: number;
  redScore: number;
  note: string;
  hasScreenshot: boolean;
  participants: MatchParticipant[];
};

export type MatchInput = {
  matchDate?: string;
  winningTeam: TeamColor;
  note?: string;
  screenshot: {
    name: string;
    contentType: "image/png" | "image/jpeg" | "image/webp";
    base64: string;
  };
  participants: Array<Omit<MatchParticipant, "playerId" | "isWinner">>;
};

export type ClassSummary = {
  id: string;
  mainWeapon: Weapon;
  offWeapon: Weapon;
  totalMatches: number;
  winRate: number;
  avgKills: number;
  avgAssists: number;
  avgDamage: number;
  avgHealing: number;
  trend: number;
};

export type PlayerSummary = {
  id: string;
  characterName: string;
  archetype: string;
  matches: number;
  wins: number;
  winRate: number;
  avgKills: number;
  avgDamage: number;
  form: string;
};

const applications: Array<{ id: string; groupName: string; createdAt: string; status: "PENDING" }> = [];
const matches: MatchSummary[] = [];
const visitorEvents: Array<{ path: string; referrer?: string; createdAt: number }> = [];

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const round = (value: number) => Math.round(value * 10) / 10;

const playerIdFor = (characterName: string) =>
  `player-${characterName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

const completedParticipants = () =>
  matches.flatMap((match) =>
    match.participants.map((participant) => ({ ...participant, match })),
  );

const buildPlayerSummaries = (): PlayerSummary[] => {
  const grouped = new Map<string, ReturnType<typeof completedParticipants>>();
  for (const entry of completedParticipants()) {
    const current = grouped.get(entry.playerId) ?? [];
    current.push(entry);
    grouped.set(entry.playerId, current);
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
};

const buildClassSummaries = (): ClassSummary[] => {
  const grouped = new Map<string, ReturnType<typeof completedParticipants>>();
  for (const entry of completedParticipants()) {
    const key = `${entry.mainWeapon}:${entry.offWeapon}`;
    const current = grouped.get(key) ?? [];
    current.push(entry);
    grouped.set(key, current);
  }

  return [...grouped.entries()].map(([id, entries]) => {
    const ordered = [...entries].sort(
      (left, right) => Date.parse(right.match.matchDate) - Date.parse(left.match.matchDate),
    );
    const midpoint = Math.ceil(ordered.length / 2);
    const recent = ordered.slice(0, midpoint);
    const earlier = ordered.slice(midpoint);
    const winRate = (sample: typeof entries) =>
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
};

export const getOverview = () => {
  const ordered = [...matches].sort(
    (left, right) => Date.parse(right.matchDate) - Date.parse(left.matchDate),
  );
  return {
    totalMatches: matches.length,
    totalPlayers: buildPlayerSummaries().length,
    activeApplications: applications.filter((application) => application.status === "PENDING").length,
    averageMatchLength: null,
    latestMatch: ordered[0] ?? null,
    momentum: ordered.slice(0, 6).reverse().map((match, index) => ({
      label: `M${index + 1}`,
      blue: match.blueScore,
      red: match.redScore,
    })),
  };
};

export const getLeaderboards = () => ({
  classes: buildClassSummaries(),
  players: buildPlayerSummaries(),
});

export const getPlayers = (search?: string, limit = 20) => {
  const normalized = search?.trim().toLowerCase();
  return buildPlayerSummaries()
    .filter((player) =>
      normalized
        ? `${player.characterName} ${player.archetype}`.toLowerCase().includes(normalized)
        : true,
    )
    .slice(0, limit);
};

export const getPlayer = (playerId: string) => {
  const player = buildPlayerSummaries().find((entry) => entry.id === playerId);
  if (!player) return null;
  const entries = completedParticipants().filter((entry) => entry.playerId === playerId);
  const record = (label: string, selector: (entry: (typeof entries)[number]) => number) => {
    const best = [...entries].sort((left, right) => selector(right) - selector(left))[0];
    return best ? { label, value: selector(best), achievedAt: best.match.matchDate } : null;
  };
  const records = [
    record("Most kills", (entry) => entry.kills),
    record("Highest damage", (entry) => entry.damageDealt),
    record("Most assists", (entry) => entry.assists),
  ].filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const weaponBreakdown = buildClassSummaries().filter((summary) =>
    entries.some(
      (entry) =>
        entry.mainWeapon === summary.mainWeapon &&
        entry.offWeapon === summary.offWeapon,
    ),
  );

  return {
    ...player,
    avgAssists: round(average(entries.map((entry) => entry.assists))),
    avgHealing: round(average(entries.map((entry) => entry.healingDone))),
    records,
    weaponBreakdown,
  };
};

export const getMatches = (limit = 10) =>
  [...matches]
    .sort((left, right) => Date.parse(right.matchDate) - Date.parse(left.matchDate))
    .slice(0, limit);

export const createApplication = (input: {
  groupName: string;
  captainName: string;
  captainContact: string;
}) => {
  const id = `app-${applications.length + 1}`;
  applications.push({
    id,
    groupName: input.groupName,
    createdAt: new Date().toISOString(),
    status: "PENDING",
  });
  return { id, status: "PENDING", message: "Your roster is in the review queue." };
};

export const commitMatch = (input: MatchInput) => {
  const id = `match-${matches.length + 1}`;
  const participants = input.participants.map((participant) => ({
    ...participant,
    playerId: playerIdFor(participant.characterName),
    isWinner: participant.team === input.winningTeam,
  }));
  const match: MatchSummary = {
    id,
    matchDate: input.matchDate || new Date().toISOString(),
    winningTeam: input.winningTeam,
    blueScore: participants
      .filter((participant) => participant.team === "BLUE")
      .reduce((sum, participant) => sum + participant.kills, 0),
    redScore: participants
      .filter((participant) => participant.team === "RED")
      .reduce((sum, participant) => sum + participant.kills, 0),
    note: input.note ?? "",
    hasScreenshot: false,
    participants,
  };
  matches.push(match);
  return match;
};

export const recordVisitor = (input: { path: string; referrer?: string }) => {
  visitorEvents.push({ ...input, createdAt: Date.now() });
};

export const getAdminSummary = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = today.getTime() - 6 * 24 * 60 * 60 * 1000;
  const recentVisitors = visitorEvents.filter((event) => event.createdAt >= weekStart);
  const activity = Array.from({ length: 7 }, (_, index) => {
    const dayStart = weekStart + index * 24 * 60 * 60 * 1000;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    return {
      label: new Date(dayStart).toLocaleDateString("en-US", { weekday: "short" }),
      blue: recentVisitors.filter((event) => event.createdAt >= dayStart && event.createdAt < dayEnd).length,
      red: applications.filter((application) => {
        const createdAt = Date.parse(application.createdAt);
        return createdAt >= dayStart && createdAt < dayEnd;
      }).length,
    };
  });
  return {
    visitorsToday: recentVisitors.filter((event) => event.createdAt >= today.getTime()).length,
    visitorsThisWeek: recentVisitors.length,
    applicationQueue: applications.filter((application) => application.status === "PENDING").length,
    ocrConfidence: null,
    activity,
  };
};

export const hasAdminAccess = (req: Request) => {
  const expected = process.env.ADMIN_ACCESS_CODE;
  if (!expected) return false;
  return req.header("x-admin-key") === expected;
};