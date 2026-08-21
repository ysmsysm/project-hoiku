import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/BabyHeader.tsx", "utf8");

test("BabyHeader shows 4, 5, and 8 character child names without truncation", () => {
  const childNames = ["やもたろ", "やもたろう", "あいうえおかきく"];

  assert.deepEqual(childNames.map((name) => Array.from(name).length), [4, 5, 8]);

  assert.match(source, />\s*\{childName\}\s*<\/h1>/);
  assert.doesNotMatch(source, /childName\s*\.\s*(?:slice|substring)\s*\(/);
  assert.doesNotMatch(source, /(?:text-ellipsis|\btruncate\b|overflow-hidden)/);
  assert.match(source, /whitespace-nowrap/);
});

test("BabyHeader reserves enough name width and scales names through 8 characters", () => {
  assert.match(source, /minmax\(0,10\.75rem\)/);
  assert.match(
    source,
    /nameLength <= 4 \? 24 : nameLength <= 6 \? 18 : nameLength <= 7 \? 16 : 14/,
  );
});
