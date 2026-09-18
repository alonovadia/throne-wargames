import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import {
  CreateApplicationResponse,
  GetLeaderboardsResponse,
  GetMatchesResponse,
  GetOverviewResponse,
  GetPlayerResponse,
  GetPlayersResponse,
} from "@workspace/api-zod";

const convexUrl = process.env.CONVEX_URL;
const serverSecret = process.env.SESSION_SECRET;
const apiUrl = process.env.TEST_API_URL ?? "http://localhost:80/api";

function requireEnvironment() {
  assert.ok(convexUrl, "CONVEX_URL must be set for archive integration tests");
  assert.ok(serverSecret, "SESSION_SECRET must be set for archive integration tests");
}

function freshClient() {
  return new ConvexHttpClient(convexUrl);
}

async function query(functionName, args = {}) {
  return freshClient().query(makeFunctionReference(functionName), args);
}

async function mutation(functionName, args) {
  return freshClient().mutation(makeFunctionReference(functionName), args);
}

async function assertMutationRejected(functionName, args, messagePattern) {
  await assert.rejects(
    mutation(functionName, args),
    messagePattern,
  );
}

async function uploadTestScoreboard() {
  const uploadUrl = await mutation("admin:generateScoreboardUploadUrl", { serverSecret });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "content-type": "image/png" },
    body: png,
  });
  assert.ok(response.ok, "test scoreboard upload failed");
  return (await response.json()).storageId;
}

async function request(path, init) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  const responseText = await response.text();
  let body;
  try {
    body = JSON.parse(responseText);
  } catch {
    assert.fail(
      `${init?.method ?? "GET"} ${path} returned ${response.status} ${response.headers.get("content-type")}: ${responseText.slice(0, 120)}`,
    );
  }
  assert.ok(response.ok, `${init?.method ?? "GET"} ${path} failed: ${JSON.stringify(body)}`);
  return body;
}

test("Convex archive writes survive fresh reads and satisfy every public API shape", async () => {
  requireEnvironment();
  const marker = `archive-${randomUUID().slice(0, 8)}`;
  const applicationMembers = Array.from({ length: 6 }, (_, index) => ({
    characterName: `${marker}-app-${index + 1}`,
    mainWeapon: "STAFF",
    offWeapon: "DAGGER",
  }));
  const participants = Array.from({ length: 12 }, (_, index) => ({
    characterName: `${marker}-match-${index + 1}`,
    team: index < 6 ? "BLUE" : "RED",
    mainWeapon: index % 2 === 0 ? "GREATSWORD" : "LONGBOW",
    offWeapon: index % 2 === 0 ? "DAGGER" : "STAFF",
    kills: index + 1,
    assists: index + 10,
    damageDealt: 100_000 + index * 1_000,
    healingDone: 5_000 + index * 100,
  }));

  try {
    const applicationReceipt = CreateApplicationResponse.parse(
      await request("/applications", {
        method: "POST",
        body: JSON.stringify({
          groupName: marker,
          captainName: "Integration Captain",
          captainContact: "integration-test",
          notes: marker,
          submissionToken: randomUUID(),
          formStartedAt: Date.now() - 5_000,
          website: "",
          members: applicationMembers,
        }),
      }),
    );
    assert.equal(applicationReceipt.status, "PENDING");

    const screenshotStorageId = await uploadTestScoreboard();
    await assertMutationRejected("admin:commitMatch", {
      serverSecret,
      screenshotStorageId,
      winningTeam: "BLUE",
      actor: "Integration Operator",
      participants: participants.map((participant, index) => ({
        ...participant,
        characterName: index === 11 ? participants[0].characterName.toUpperCase() : participant.characterName,
      })),
    }, /same participant more than once/);
    await assertMutationRejected("admin:commitMatch", {
      serverSecret,
      screenshotStorageId,
      winningTeam: "BLUE",
      actor: "Integration Operator",
      participants: participants.map((participant, index) => ({
        ...participant,
        team: index < 7 ? "BLUE" : "RED",
      })),
    }, /six participants on each team/);
    await assertMutationRejected("admin:commitMatch", {
      serverSecret,
      screenshotStorageId,
      winningTeam: "BLUE",
      actor: "Integration Operator",
      participants: participants.map((participant, index) => ({
        ...participant,
        damageDealt: index === 0 ? Number.MAX_SAFE_INTEGER + 1 : participant.damageDealt,
      })),
    }, /valid name and non-negative whole-number statistics/);
    const matchId = await mutation("admin:commitMatch", {
      serverSecret,
      screenshotStorageId,
      winningTeam: "BLUE",
      matchDate: Date.now(),
      note: marker,
      actor: "Integration Operator",
      participants,
    });
    assert.equal(typeof matchId, "string");

    const persisted = await query("testSupport:snapshot", { serverSecret, marker });
    assert.equal(persisted.application?.id, applicationReceipt.id);
    assert.equal(persisted.application?.status, "PENDING");
    assert.equal(persisted.application?.members.length, 6);
    assert.deepEqual(
      new Set(persisted.application?.members.map((member) => member.characterName)),
      new Set(applicationMembers.map((member) => member.characterName)),
    );
    assert.equal(persisted.match?.id, matchId);
    assert.equal(persisted.match?.status, "COMPLETED");
    assert.equal(persisted.match?.hasScreenshot, true);
    assert.equal(persisted.match?.participants.length, 12);

    const overview = GetOverviewResponse.parse(await request("/overview"));
    assert.equal(overview.latestMatch?.id, matchId);
    assert.equal(overview.latestMatch?.participants.length, 12);

    const leaderboards = GetLeaderboardsResponse.parse(await request("/leaderboards"));
    assert.ok(
      leaderboards.players.some((player) => player.characterName === participants[0].characterName),
    );
    assert.ok(leaderboards.classes.length > 0);

    const players = GetPlayersResponse.parse(
      await request(`/players?search=${encodeURIComponent(marker)}&limit=100`),
    );
    assert.equal(players.length, 12);
    const player = players.find((row) => row.characterName === participants[0].characterName);
    assert.ok(player);

    const profile = GetPlayerResponse.parse(
      await request(`/players/${encodeURIComponent(player.id)}`),
    );
    assert.equal(profile.characterName, player.characterName);
    assert.ok(profile.records.length > 0);
    assert.ok(profile.weaponBreakdown.length > 0);

    const matches = GetMatchesResponse.parse(await request("/matches?limit=50"));
    const committed = matches.find((match) => match.id === matchId);
    assert.ok(committed);
    assert.equal(committed.participants.length, 12);
    assert.equal(committed.blueScore, 21);
    assert.equal(committed.redScore, 57);

    const reviewed = await mutation("admin:updateApplicationStatus", {
      serverSecret,
      applicationId: applicationReceipt.id,
      status: "APPROVED",
      actor: "Integration Operator",
      reason: "Verified test roster",
    });
    assert.equal(reviewed.status, "APPROVED");
    assert.equal(reviewed.audit[0].action, "APPLICATION_APPROVED");

    const corrected = await mutation("admin:correctMatch", {
      serverSecret,
      matchId,
      actor: "Integration Operator",
      reason: "Correct test score",
      matchDate: Date.now(),
      winningTeam: "BLUE",
      note: marker,
      participants: participants.map((participant, index) => ({
        ...participant,
        kills: index === 0 ? 99 : participant.kills,
      })),
    });
    assert.equal(corrected.blueScore, 119);
    assert.equal(corrected.audit[0].action, "MATCH_CORRECTED");

    const discarded = await mutation("admin:discardMatch", {
      serverSecret,
      matchId,
      actor: "Integration Operator",
      reason: "Finish discard test",
    });
    assert.equal(discarded.status, "DISCARDED");
    assert.equal(discarded.audit[0].action, "MATCH_DISCARDED");
    const publicAfterDiscard = GetMatchesResponse.parse(await request("/matches?limit=50"));
    assert.equal(publicAfterDiscard.some((match) => match.id === matchId), false);
  } finally {
    const removed = await mutation("testSupport:cleanup", { serverSecret, marker });
    assert.ok(removed.applications <= 1);
    assert.ok(removed.matches <= 1);
    const afterCleanup = await query("testSupport:snapshot", { serverSecret, marker });
    assert.equal(afterCleanup.application, null);
    assert.equal(afterCleanup.match, null);
  }
});