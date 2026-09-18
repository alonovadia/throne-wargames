import { Router, type IRouter, type Request, type Response } from "express";
import {
  CommitMatchBody,
  CreateApplicationBody,
  GetLeaderboardsResponse,
  GetMatchesQueryParams,
  GetMatchesResponse,
  GetOverviewResponse,
  GetPlayerParams,
  GetPlayerResponse,
  GetPlayersQueryParams,
  GetPlayersResponse,
  GetAdminSummaryResponse,
  CreateApplicationResponse,
  CommitMatchResponse,
  RecordVisitorBody,
  GetAdminApplicationsResponse,
  UpdateApplicationStatusParams,
  UpdateApplicationStatusBody,
  UpdateApplicationStatusResponse,
  GetAdminMatchesResponse,
  CorrectMatchParams,
  CorrectMatchBody,
  CorrectMatchResponse,
  DiscardMatchParams,
  DiscardMatchBody,
  DiscardMatchResponse,
  RestoreMatchParams,
  RestoreMatchBody,
  RestoreMatchResponse,
  GetClassesResponse,
  GetAdminClassesResponse,
  CreateClassBody,
  CreateClassResponse,
  UpdateClassParams,
  UpdateClassBody,
  UpdateClassResponse,
  DeleteClassParams,
  DeleteClassBody,
} from "@workspace/api-zod";
import {
  createApplication,
  commitMatch,
  getAdminSummary,
  getLeaderboards,
  getMatches,
  getOverview,
  getPlayer,
  getPlayers,
  hasAdminAccess,
  getClasses,
  recordVisitor,
} from "../data/wargames";
import { convexMutation, convexQuery, isConvexConfigured } from "../lib/convex";
import {
  allowPublicWrite,
  anonymousVisitorKey,
  publicWriteRateLimitKey,
  safeReferrer,
} from "../lib/public-write-protection";

const router: IRouter = Router();

function privilegedConvexArgs(args: Record<string, unknown> = {}) {
  const serverSecret = process.env.SESSION_SECRET;
  if (!serverSecret) {
    throw new Error("SESSION_SECRET is required for privileged Convex operations.");
  }
  return { ...args, serverSecret };
}

const maxScoreboardBytes = 8 * 1024 * 1024;

async function consumePublicWriteLimit(
  req: Request,
  scope: string,
  limit: number,
  windowMs: number,
) {
  if (!isConvexConfigured) {
    return { allowed: allowPublicWrite(req, scope, limit, windowMs), retryAfterMs: 0 };
  }
  return convexMutation<{ allowed: boolean; retryAfterMs: number }>(
    "admin:consumePublicWriteLimit",
    privilegedConvexArgs({
      key: publicWriteRateLimitKey(req, scope),
      limit,
      windowMs,
    }),
  );
}

function rejectRateLimitedWrite(
  res: Response,
  message: string,
  retryAfterMs: number,
) {
  res.set("Retry-After", String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
  res.status(429).json({ error: message });
}

function decodeScoreboard(input: {
  name: string;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
}) {
  const bytes = Buffer.from(input.base64, "base64");
  if (!bytes.length || bytes.length > maxScoreboardBytes) {
    throw new Error("Scoreboard screenshots must be between 1 byte and 8 MB.");
  }
  const signatures = {
    "image/png": bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/jpeg": bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    "image/webp": bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP",
  };
  if (!signatures[input.contentType]) {
    throw new Error("The scoreboard file does not match its declared image type.");
  }
  return bytes;
}

router.get("/overview", async (_req, res, next) => {
  try {
    const data = isConvexConfigured
      ? await convexQuery<ReturnType<typeof getOverview>>("public:overview")
      : getOverview();
    res.json(GetOverviewResponse.parse(data));
  } catch (error) {
    next(error);
  }
});

router.get("/classes", async (_req, res, next) => {
  try {
    const data = isConvexConfigured ? await convexQuery("public:classes") : getClasses();
    res.json(GetClassesResponse.parse(data));
  } catch (error) { next(error); }
});

router.get("/admin/classes", async (req, res, next) => {
  if (!hasAdminAccess(req)) { res.status(401).json({ error: "Admin authentication required" }); return; }
  try {
    if (!isConvexConfigured) { res.status(503).json({ error: "Persistent class storage is not configured" }); return; }
    const data = await convexQuery("admin:classes", privilegedConvexArgs({ includeInactive: true }));
    res.json(GetAdminClassesResponse.parse(data));
  } catch (error) { next(error); }
});

router.post("/admin/classes", async (req, res, next) => {
  if (!hasAdminAccess(req)) { res.status(401).json({ error: "Admin authentication required" }); return; }
  try {
    const parsed = CreateClassBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid class data", details: parsed.error.flatten().fieldErrors });
      return;
    }
    const input = parsed.data;
    if (!isConvexConfigured) { res.status(503).json({ error: "Persistent class storage is not configured" }); return; }
    const data = await convexMutation("admin:createClass", privilegedConvexArgs(input));
    res.status(201).json(CreateClassResponse.parse(data));
  } catch (error) { next(error); }
});

router.patch("/admin/classes/:classKey", async (req, res, next) => {
  if (!hasAdminAccess(req)) { res.status(401).json({ error: "Admin authentication required" }); return; }
  try {
    const params = UpdateClassParams.parse(req.params);
    const input = UpdateClassBody.parse(req.body);
    if (!isConvexConfigured) { res.status(503).json({ error: "Persistent class storage is not configured" }); return; }
    const data = await convexMutation("admin:updateClass", privilegedConvexArgs({ key: params.classKey, ...input }));
    res.json(UpdateClassResponse.parse(data));
  } catch (error) { next(error); }
});

router.delete("/admin/classes/:classKey", async (req, res, next) => {
  if (!hasAdminAccess(req)) { res.status(401).json({ error: "Admin authentication required" }); return; }
  try {
    const params = DeleteClassParams.parse(req.params);
    const input = DeleteClassBody.parse(req.body);
    if (!isConvexConfigured) { res.status(503).json({ error: "Persistent class storage is not configured" }); return; }
    await convexMutation("admin:deleteClass", privilegedConvexArgs({ key: params.classKey, ...input }));
    res.status(204).end();
  } catch (error) { next(error); }
});

router.get("/leaderboards", async (_req, res, next) => {
  try {
    const data = isConvexConfigured
      ? await convexQuery<ReturnType<typeof getLeaderboards>>("public:leaderboards")
      : getLeaderboards();
    res.json(GetLeaderboardsResponse.parse(data));
  } catch (error) {
    next(error);
  }
});

router.get("/players", async (req, res, next) => {
  try {
    const params = GetPlayersQueryParams.parse(req.query);
    const args = {
      ...(params.search ? { search: params.search } : {}),
      ...(params.limit ? { limit: params.limit } : {}),
    };
    const data = isConvexConfigured
      ? await convexQuery<ReturnType<typeof getPlayers>>("public:players", args)
      : getPlayers(params.search, params.limit);
    res.json(GetPlayersResponse.parse(data));
  } catch (error) {
    next(error);
  }
});

router.get("/players/:playerId", async (req, res, next) => {
  try {
    const params = GetPlayerParams.parse(req.params);
    const player = isConvexConfigured
      ? await convexQuery<ReturnType<typeof getPlayer>>("public:player", { playerId: params.playerId })
      : getPlayer(params.playerId);
    if (!player) {
      res.status(404).json({ error: "Player not found" });
      return;
    }
    res.json(GetPlayerResponse.parse(player));
  } catch (error) {
    next(error);
  }
});

router.get("/matches", async (req, res, next) => {
  try {
    const params = GetMatchesQueryParams.parse(req.query);
    const args = params.limit ? { limit: params.limit } : {};
    const data = isConvexConfigured
      ? await convexQuery<ReturnType<typeof getMatches>>("public:matches", args)
      : getMatches(params.limit);
    res.json(GetMatchesResponse.parse(data));
  } catch (error) {
    next(error);
  }
});

router.post("/visitor-events", async (req, res, next) => {
  try {
    const rateLimit = await consumePublicWriteLimit(req, "visitor", 60, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      rejectRateLimitedWrite(res, "Too many visit events", rateLimit.retryAfterMs);
      return;
    }
    const parsed = RecordVisitorBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid visitor event" });
      return;
    }
    const input = parsed.data;
    const referrer = safeReferrer(input.referrer);
    if (isConvexConfigured) {
      await convexMutation("admin:recordVisitor", privilegedConvexArgs({
        path: input.path,
        ...(referrer ? { referrer } : {}),
        eventKey: anonymousVisitorKey(req, input.path),
      }));
    } else {
      recordVisitor({
        path: input.path,
        ...(referrer ? { referrer } : {}),
      });
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post("/applications", async (req, res, next) => {
  try {
    const rateLimit = await consumePublicWriteLimit(req, "application", 5, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      rejectRateLimitedWrite(res, "Too many application attempts", rateLimit.retryAfterMs);
      return;
    }
    const parsed = CreateApplicationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid roster application" });
      return;
    }
    const input = parsed.data;
    if (input.website || Date.now() - input.formStartedAt < 3_000) {
      res.status(400).json({ error: "Invalid application submission" });
      return;
    }
    const { website: _website, formStartedAt: _formStartedAt, ...application } = input;
    const result = isConvexConfigured
      ? await convexMutation("admin:submitApplication", privilegedConvexArgs(application))
      : createApplication(application);
    const receipt = isConvexConfigured
      ? { id: String(result), status: "PENDING", message: "Your roster is in the review queue." }
      : result;
    res.status(201).json(CreateApplicationResponse.parse(receipt));
  } catch (error) {
    next(error);
  }
});

router.get("/admin/summary", async (req, res, next) => {
  if (!hasAdminAccess(req)) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
  try {
    const data = isConvexConfigured
      ? await convexQuery<ReturnType<typeof getAdminSummary>>(
          "admin:summary",
          privilegedConvexArgs(),
        )
      : getAdminSummary();
    res.json(GetAdminSummaryResponse.parse(data));
  } catch (error) {
    next(error);
  }
});

router.get("/admin/applications", async (req, res, next) => {
  if (!hasAdminAccess(req)) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
  try {
    if (!isConvexConfigured) {
      res.status(503).json({ error: "Persistent application storage is not configured" });
      return;
    }
    const data = await convexQuery("admin:applications", privilegedConvexArgs());
    res.json(GetAdminApplicationsResponse.parse(data));
  } catch (error) {
    next(error);
  }
});

router.patch("/admin/applications/:applicationId/status", async (req, res, next) => {
  if (!hasAdminAccess(req)) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
  try {
    const params = UpdateApplicationStatusParams.parse(req.params);
    const input = UpdateApplicationStatusBody.parse(req.body);
    if (!isConvexConfigured) {
      res.status(503).json({ error: "Persistent application storage is not configured" });
      return;
    }
    const data = await convexMutation("admin:updateApplicationStatus", privilegedConvexArgs({
      applicationId: params.applicationId,
      ...input,
    }));
    res.json(UpdateApplicationStatusResponse.parse(data));
  } catch (error) {
    next(error);
  }
});

router.get("/admin/matches", async (req, res, next) => {
  if (!hasAdminAccess(req)) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
  try {
    if (!isConvexConfigured) {
      res.status(503).json({ error: "Persistent match storage is not configured" });
      return;
    }
    const data = await convexQuery("admin:matches", privilegedConvexArgs());
    res.json(GetAdminMatchesResponse.parse(data));
  } catch (error) {
    next(error);
  }
});

router.post("/admin/matches", async (req, res, next) => {
  if (!hasAdminAccess(req)) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
  const input = CommitMatchBody.parse(req.body);
  let uploadedStorageId: string | null = null;
  try {
    if (isConvexConfigured) {
      const screenshotBytes = decodeScoreboard(input.screenshot);
      const uploadUrl = await convexMutation<string>(
        "admin:generateScoreboardUploadUrl",
        privilegedConvexArgs(),
      );
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": input.screenshot.contentType },
        body: screenshotBytes,
      });
      if (!uploadResponse.ok) {
        throw new Error("The scoreboard screenshot could not be stored.");
      }
      const uploaded = await uploadResponse.json() as { storageId?: string };
      if (!uploaded.storageId) {
        throw new Error("The scoreboard upload did not return a storage identifier.");
      }
      uploadedStorageId = uploaded.storageId;
      const { screenshot: _screenshot, ...matchInput } = input;
      const result = await convexMutation<string>("admin:commitMatch", {
        ...privilegedConvexArgs(matchInput),
        screenshotStorageId: uploadedStorageId,
        ...(input.matchDate ? { matchDate: Date.parse(input.matchDate) } : {}),
      });
      uploadedStorageId = null;
      const committed = await convexQuery("public:matchById", { matchId: result });
      res.status(201).json(CommitMatchResponse.parse(committed));
      return;
    }
    throw new Error("Persistent scoreboard storage requires Convex to be configured.");
  } catch (error) {
    if (uploadedStorageId) {
      try {
        await convexMutation(
          "admin:deleteScoreboardUpload",
          privilegedConvexArgs({ storageId: uploadedStorageId }),
        );
      } catch (cleanupError) {
        req.log.error({ err: cleanupError }, "Failed to clean up unlinked scoreboard upload");
      }
    }
    next(error);
  }
});

router.get("/admin/matches/:matchId/scoreboard", async (req, res, next) => {
  if (!hasAdminAccess(req)) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
  try {
    if (!isConvexConfigured) {
      res.status(404).json({ error: "Match scoreboard not found" });
      return;
    }
    const url = await convexQuery<string | null>(
      "admin:scoreboardUrl",
      privilegedConvexArgs({ matchId: req.params.matchId }),
    );
    if (!url) {
      res.status(404).json({ error: "Match scoreboard not found" });
      return;
    }
    res.redirect(302, url);
  } catch (error) {
    next(error);
  }
});

router.patch("/admin/matches/:matchId", async (req, res, next) => {
  if (!hasAdminAccess(req)) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
  try {
    const params = CorrectMatchParams.parse(req.params);
    const input = CorrectMatchBody.parse(req.body);
    const matchDate = Date.parse(input.matchDate);
    if (!Number.isFinite(matchDate)) {
      res.status(400).json({ error: "Invalid match date" });
      return;
    }
    if (!isConvexConfigured) {
      res.status(503).json({ error: "Persistent match storage is not configured" });
      return;
    }
    const data = await convexMutation("admin:correctMatch", privilegedConvexArgs({
      matchId: params.matchId,
      ...input,
      matchDate,
    }));
    res.json(CorrectMatchResponse.parse(data));
  } catch (error) {
    next(error);
  }
});

router.delete("/admin/matches/:matchId", async (req, res, next) => {
  if (!hasAdminAccess(req)) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
  try {
    const params = DiscardMatchParams.parse(req.params);
    const input = DiscardMatchBody.parse(req.body);
    if (!isConvexConfigured) {
      res.status(503).json({ error: "Persistent match storage is not configured" });
      return;
    }
    const data = await convexMutation("admin:discardMatch", privilegedConvexArgs({
      matchId: params.matchId,
      ...input,
    }));
    res.json(DiscardMatchResponse.parse(data));
  } catch (error) {
    next(error);
  }
});

router.post("/admin/matches/:matchId/restore", async (req, res, next) => {
  if (!hasAdminAccess(req)) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
  try {
    const params = RestoreMatchParams.parse(req.params);
    const input = RestoreMatchBody.parse(req.body);
    if (!isConvexConfigured) {
      res.status(503).json({ error: "Persistent match storage is not configured" });
      return;
    }
    const data = await convexMutation("admin:restoreMatch", privilegedConvexArgs({
      matchId: params.matchId,
      ...input,
    }));
    res.json(RestoreMatchResponse.parse(data));
  } catch (error) {
    next(error);
  }
});

export default router;