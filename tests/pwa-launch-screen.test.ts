import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const globalStyles = readFileSync("app/globals.css", "utf8");
const rootLayout = readFileSync("app/layout.tsx", "utf8");

const startupImages = [
  [1320, 2868],
  [1290, 2796],
  [1284, 2778],
  [1242, 2688],
  [1206, 2622],
  [1179, 2556],
  [1170, 2532],
  [1125, 2436],
  [828, 1792],
  [750, 1334],
] as const;

test("iPhone cold start uses the app background before App Router renders", () => {
  assert.equal(
    (globalStyles.match(/background: #fffbf2;/g) ?? []).length,
    3,
  );
  assert.equal(
    (rootLayout.match(/style=\{\{ backgroundColor: "#FFFBF2" \}\}/g) ?? [])
      .length,
    2,
  );
  assert.match(rootLayout, /rel="apple-touch-startup-image"/);
  assert.match(rootLayout, /orientation: portrait/);
  assert.match(
    rootLayout,
    /href=\{`\/icons\/startup\/iphone-\$\{imageWidth\}x\$\{imageHeight\}\.png`\}/,
  );

  for (const [width, height] of startupImages) {
    const imagePath = `public/icons/startup/iphone-${width}x${height}.png`;
    const image = readFileSync(imagePath);

    assert.equal(image.subarray(1, 4).toString("ascii"), "PNG");
    assert.equal(image.readUInt32BE(16), width);
    assert.equal(image.readUInt32BE(20), height);
    assert.match(rootLayout, new RegExp(`, ${width}, ${height}\\]`));
  }
});
