import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mockupPreviewPlugin } from "../mockupPreviewPlugin.ts";

async function invokeHook(hook: unknown, ...args: unknown[]): Promise<void> {
  const handler =
    typeof hook === "function"
      ? hook
      : (hook as { handler?: (...hookArgs: unknown[]) => unknown }).handler;

  assert.equal(typeof handler, "function", "expected a callable Vite hook");
  await handler(...args);
}

async function waitForFile(filePath: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return await readFile(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw new Error(`Timed out waiting for ${filePath}`);
}

test("discovers nested public mockups and excludes underscore-prefixed paths", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mockup-preview-plugin-"));
  const fixtures: Record<string, string> = {
    "src/components/mockups/PublicPreview.tsx": "export default function PublicPreview() {}",
    "src/components/mockups/nested/DeepPreview.tsx": "export default function DeepPreview() {}",
    "src/components/mockups/_PrivatePreview.tsx": "export default function PrivatePreview() {}",
    "src/components/mockups/_draft/HiddenPreview.tsx": "export default function HiddenPreview() {}",
    "src/components/mockups/nested/_private/HiddenNested.tsx": "export default function HiddenNested() {}",
  };
  const plugin = mockupPreviewPlugin();

  try {
    await Promise.all(
      Object.entries(fixtures).map(async ([relativePath, contents]) => {
        const absolutePath = path.join(root, relativePath);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, contents);
      }),
    );

    await invokeHook(plugin.configResolved, { root });
    await invokeHook(plugin.buildStart);

    const generatedPath = path.join(
      root,
      "src/.generated/mockup-components.ts",
    );
    const source = await readFile(generatedPath, "utf8");

    assert.match(source, /"\.\/components\/mockups\/PublicPreview\.tsx"/);
    assert.match(
      source,
      /"\.\/components\/mockups\/nested\/DeepPreview\.tsx": \(\) => import\("\.\.\/components\/mockups\/nested\/DeepPreview\.tsx"\)/,
    );
    assert.match(
      source,
      /"\.\/components\/mockups\/PublicPreview\.tsx": \(\) => import\("\.\.\/components\/mockups\/PublicPreview\.tsx"\)/,
    );
    assert.doesNotMatch(source, /_PrivatePreview|_draft|_private|Hidden/);
    assert.equal((source.match(/\(\) => import\(/g) ?? []).length, 2);
  } finally {
    await plugin.closeWatcher?.();
    await rm(root, { recursive: true, force: true });
  }
});

test("recreates a missing registry only after a preview-related 404", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mockup-preview-recovery-"));
  const mockupPath = path.join(
    root,
    "src/components/mockups/PublicPreview.tsx",
  );
  const generatedPath = path.join(
    root,
    "src/.generated/mockup-components.ts",
  );
  const plugin = mockupPreviewPlugin();
  let middleware:
    | ((
        req: { url?: string },
        res: { statusCode: number; end: () => unknown },
        next: () => void,
      ) => void)
    | undefined;

  try {
    await mkdir(path.dirname(mockupPath), { recursive: true });
    await writeFile(mockupPath, "export default function PublicPreview() {}");
    await invokeHook(plugin.configResolved, { root });
    await invokeHook(plugin.buildStart);

    const viteServer = {
      middlewares: {
        use(handler: typeof middleware) {
          middleware = handler;
        },
      },
    };
    await invokeHook(plugin.configureServer, viteServer);
    assert.ok(middleware, "plugin should register its recovery middleware");

    await unlink(generatedPath);
    const unrelatedResponse = { statusCode: 404, end() {} };
    middleware({ url: "/unrelated/missing-file" }, unrelatedResponse, () => {});
    unrelatedResponse.end();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await assert.rejects(readFile(generatedPath), { code: "ENOENT" });

    const previewResponse = { statusCode: 404, end() {} };
    middleware(
      { url: "/src/.generated/mockup-components.ts" },
      previewResponse,
      () => {},
    );
    previewResponse.end();

    const recoveredSource = await waitForFile(generatedPath);
    assert.match(recoveredSource, /PublicPreview\.tsx/);
  } finally {
    await plugin.closeWatcher?.();
    await rm(root, { recursive: true, force: true });
  }
});
