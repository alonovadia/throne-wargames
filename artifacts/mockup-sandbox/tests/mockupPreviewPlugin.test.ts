import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
