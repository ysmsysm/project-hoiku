import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/HomeClient.tsx", "utf8");

test("local completion removes prepared spots and settles prepared rough items", () => {
  const handler = source.slice(
    source.indexOf("const completePreparation ="),
    source.indexOf("const runSharedSendThanks ="),
  );
  assert.match(
    handler,
    /preparedStockItemIds[\s\S]*nextStates\[itemId\] = "十分"[\s\S]*saveRoughStates/,
  );
  assert.match(
    handler,
    /updateSpotAdditions\([\s\S]*spotAdditions\.filter\(\(addition\) => deferredItemIds\.has\(addition\.itemId\)\)/,
  );
  assert.match(
    handler,
    /temporaryTodayOnlyItems\.filter\(\(item\) => deferredItemIds\.has\(item\.id\)\)/,
  );
});

test("shared completion reload drives spot and rough check-side state", () => {
  const spotSync = source.slice(
    source.indexOf("const spots = getSharedDailyCheckSpotItems"),
    source.indexOf("setSpotDeadlines(deadlines)"),
  );
  const completion = source.slice(
    source.indexOf("const runSharedCompletePreparation ="),
    source.indexOf("const completePreparation ="),
  );
  assert.match(spotSync, /setSelectedTodayOnlyIds/);
  assert.match(spotSync, /setTemporaryTodayOnlyItems/);
  assert.match(completion, /loadDailyData\([\s\S]*applyCompletedSessionToSharedDailyState/);
  assert.match(
    completion,
    /getSharedDailyCompletedRoughTemplateIds\(loaded\.session\)[\s\S]*next\[itemTemplateId\] = "十分"/,
  );
  assert.match(completion, /reloadSharedDurableSettings\(\)/);
});

test("completed prepared template spot routes plus back through shared add", () => {
  const addHandler = source.slice(
    source.indexOf("const addSpotItem ="),
    source.indexOf("const removeSpotItem ="),
  );
  assert.match(
    addHandler,
    /existingItem[\s\S]*currentSession\.isCompleted[\s\S]*existingItem\.isPrepared[\s\S]*existingItem\.isDeferred/,
  );
  assert.match(
    addHandler,
    /runSharedDailySpotMutation\(\{[\s\S]*action: "add_template"/,
  );
});
