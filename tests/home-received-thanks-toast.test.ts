import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/HomeClient.tsx", "utf8");

test("Home consumes a thanks notification only for the shared receiver", () => {
  assert.match(source, /sharedThanksDisplay === "received"/);
  assert.match(source, /dataSource\.mode === "shared"/);
  assert.match(source, /consumeDailyThanksNotification\(/);
  assert.match(source, /receivedThanksSessionDate/);
  assert.doesNotMatch(
    source.slice(
      source.indexOf("const receivedThanksDailySessionId"),
      source.indexOf("const isUnsentSharedSelfThanks"),
    ),
    /localStorage|appRepository/,
  );
});

test("Home displays only a current successful first consume", () => {
  assert.match(source, /receivedThanksConsumeRequestRef\.current !== currentRequest/);
  assert.match(
    source,
    /receivedThanksConsumeScopeKeyRef\.current !== currentRequest\.eventKey/,
  );
  assert.match(source, /result\.status !== "success"/);
  assert.match(source, /!result\.consumed/);
  assert.match(source, /!result\.shouldDisplay/);
  assert.match(source, /dailyItemMutationMountedRef\.current/);
});

test("received thanks toast is centered, non-blocking and fades after about two seconds", () => {
  assert.match(source, /pointer-events-none fixed inset-x-0 top-1\/2/);
  assert.match(source, /ありがとうが届きました/);
  assert.match(source, /border-\[#efb5c3\]/);
  assert.match(source, /bg-\[#fff8fa\]/);
  assert.match(source, /role="status"/);
  assert.match(source, /}, 1700\);/);
  assert.match(source, /}, 2100\);/);
  assert.match(source, /phase: "fading"/);
  assert.doesNotMatch(source, /receivedThanksToast[\s\S]{0,300}backdrop/);
});
