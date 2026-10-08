import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const layout = readFileSync(join(ROOT, "src/app/layout.tsx"), "utf8");

describe("pages build fonts", () => {
  it("does not load next/font/google at build time", () => {
    const imports = layout
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import "))
      .join("\n");
    assert.doesNotMatch(imports, /next\/font\/google/);
    assert.match(imports, /next\/font\/local/);
  });

  it("points each face at a real woff2", () => {
    const paths = [...layout.matchAll(/path:\s*"([^"]+\.woff2)"/g)].map((m) => m[1]);
    assert.deepEqual(paths, [
      "../fonts/ibm-plex-sans-latin-400-normal.woff2",
      "../fonts/ibm-plex-sans-latin-500-normal.woff2",
      "../fonts/ibm-plex-sans-latin-600-normal.woff2",
      "../fonts/noto-sans-sc-chinese-simplified-400-normal.woff2",
      "../fonts/noto-sans-sc-chinese-simplified-500-normal.woff2",
      "../fonts/noto-sans-sc-chinese-simplified-700-normal.woff2",
      "../fonts/ibm-plex-mono-latin-400-normal.woff2",
      "../fonts/ibm-plex-mono-latin-500-normal.woff2",
    ]);
    for (const rel of paths) {
      const bytes = readFileSync(join(ROOT, "src/app", rel));
      assert.equal(bytes.subarray(0, 4).toString(), "wOF2", rel);
      assert.ok(bytes.length > 1000, rel);
    }
  });
});
