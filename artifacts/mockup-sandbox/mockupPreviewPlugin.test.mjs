import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin.ts";

async function fixture(t, files) {
  const root = await mkdtemp(path.join(os.tmpdir(), "mockup-discovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of files) {
    const absolute = path.join(root, "src/components/mockups", file);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, "");
  }
  const plugin = mockupPreviewPlugin();
  plugin.configResolved({ root });
  return {
    root,
    async generate() {
      await plugin.buildStart();
      return readFile(path.join(root, "src/.generated/mockup-components.ts"), "utf8");
    },
  };
}

test("discovers nested TSX mockups while ignoring private and hidden files", async (t) => {
  const { generate } = await fixture(t, [
    "Card.tsx",
    "nested/Panel.tsx",
    "_Private.tsx",
    "_internal/Helper.tsx",
    "nested/_private/Helper.tsx",
    ".hidden/Hidden.tsx",
    ".Hidden.tsx",
    "notes.ts",
  ]);
  const source = await generate();
  assert.match(source, /"\.\/components\/mockups\/Card\.tsx": \(\) => import\("\.\.\/components\/mockups\/Card\.tsx"\)/);
  assert.match(source, /"\.\/components\/mockups\/nested\/Panel\.tsx"/);
  assert.equal((source.match(/\(\) => import/g) ?? []).length, 2);
});

test("handles a missing mockups directory and rescans added and removed files", async (t) => {
  const { root, generate } = await fixture(t, []);
  assert.doesNotMatch(await generate(), /\(\) => import/);
  const mockups = path.join(root, "src/components/mockups");
  await mkdir(mockups, { recursive: true });
  const file = path.join(mockups, "New.tsx");
  await writeFile(file, "");
  assert.match(await generate(), /New\.tsx/);
  await rm(file);
  assert.doesNotMatch(await generate(), /New\.tsx/);
});
