import { defineSchema, defineTable } from "convex/server";
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

export default defineSchema({
  users: defineTable({
    email: v.optional(v.string()),
    role: v.union(v.literal("USER"), v.literal("ADMIN")),
    createdAt: v.number(),
  }).index("by_email", ["email"]),
  players: defineTable({
    characterName: v.string(),
    discordTag: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_character_name", ["characterName"]),
  applications: defineTable({
    groupName: v.string(),
    captainName: v.string(),
    captainContact: v.string(),
    notes: v.optional(v.string()),
    status: v.union(
      v.literal("PENDING"),
      v.literal("APPROVED"),
      v.literal("REJECTED"),
      v.literal("CANCELLED"),
    ),
    submissionToken: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_submission_token", ["submissionToken"]),
  applicationMembers: defineTable({
    applicationId: v.id("applications"),
    playerId: v.id("players"),
    mainWeapon: weapon,
    offWeapon: weapon,
  }).index("by_application", ["applicationId"]),
  matches: defineTable({
    matchDate: v.number(),
    status: v.union(
      v.literal("PROCESSING"),
      v.literal("COMPLETED"),
      v.literal("DISCARDED"),
    ),
    winningTeam: v.optional(team),
    screenshotStorageId: v.optional(v.id("_storage")),
    note: v.optional(v.string()),
  }).index("by_match_date", ["matchDate"]),
  auditRecords: defineTable({
    entityType: v.union(v.literal("APPLICATION"), v.literal("MATCH")),
    entityId: v.string(),
    action: v.union(
      v.literal("APPLICATION_APPROVED"),
      v.literal("APPLICATION_REJECTED"),
      v.literal("APPLICATION_CANCELLED"),
      v.literal("MATCH_CREATED"),
      v.literal("MATCH_CORRECTED"),
      v.literal("MATCH_DISCARDED"),
      v.literal("MATCH_RESTORED"),
    ),
    actor: v.string(),
    reason: v.optional(v.string()),
    before: v.optional(v.string()),
    after: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_entity", ["entityType", "entityId"])
    .index("by_created_at", ["createdAt"]),
  matchParticipants: defineTable({
    matchId: v.id("matches"),
    playerId: v.id("players"),
    team,
    isWinner: v.boolean(),
    mainWeapon: weapon,
    offWeapon: weapon,
    kills: v.number(),
    assists: v.number(),
    damageDealt: v.number(),
    healingDone: v.number(),
  })
    .index("by_match", ["matchId"])
    .index("by_player", ["playerId"])
    .index("by_weapon_pair", ["mainWeapon", "offWeapon"]),
  personalRecords: defineTable({
    playerId: v.id("players"),
    matchId: v.id("matches"),
    recordType: v.string(),
    value: v.number(),
    achievedAt: v.number(),
  })
    .index("by_player", ["playerId"])
    .index("by_record_type", ["recordType", "value"]),
  visitorEvents: defineTable({
    path: v.string(),
    referrer: v.optional(v.string()),
    eventKey: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_created_at", ["createdAt"])
    .index("by_event_key", ["eventKey"])
    .index("by_expires_at", ["expiresAt"]),
  publicWriteRateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    resetAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_expires_at", ["expiresAt"]),
});
