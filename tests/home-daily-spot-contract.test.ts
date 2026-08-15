import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/HomeClient.tsx", "utf8");

test("local daily spot persistence stays behind the local mutation boundary", () => {
  assert.match(source, /const updateSpotAdditions[\s\S]*if \(!canRunLocalDailyMutation\)[\s\S]*appRepository\.saveSpotAdditions/);
  assert.match(source, /const updateSpotDeadlines[\s\S]*if \(!canRunLocalDailyMutation\)[\s\S]*appRepository\.saveSpotDeadlines/);
  assert.match(source, /const updateTemporaryTodayOnlyItems[\s\S]*if \(!canRunLocalDailyMutation\)[\s\S]*appRepository\.saveTodayOnlyTemporaryItems/);
});

test("shared add, temporary, delete, swipe and due operations use only the daily spot RPC", () => {
  for (const action of ["add_template", "add_temporary", "delete", "set_due_date"]) {
    assert.match(source, new RegExp(`action: "${action}"`));
  }
  assert.match(source, /removeTemporaryTodayOnlyItem[\s\S]*dailyMode === "shared-success"[\s\S]*removeSpotItem\(itemId\)/);
  assert.match(source, /onPointerDown=[\s\S]*canRunTodaySpotMutation/);
  assert.doesNotMatch(source, /deleteFamilyItemTemplateForDay[\s\S]*toggleSpotItem/);
});

test("shared success performs full load_daily_data reload and canonical replacement", () => {
  const runner = source.slice(source.indexOf("const runSharedDailySpotMutation"), source.indexOf("const getSharedSpotItem"));
  assert.match(runner, /mutateDailySpotItem\([\s\S]*loadDailyData\([\s\S]*setSharedDailyState\([\s\S]*mapDailySessionToSharedDailyState/);
  assert.doesNotMatch(runner, /saveSpotAdditions|saveSpotDeadlines|saveTodayOnlyTemporaryItems|localStorage/);
  assert.doesNotMatch(runner, /applyUpdatedItemToSharedDailyState/);
});

test("shared failure has no local fallback and stale mutation or reload cannot apply", () => {
  const runner = source.slice(source.indexOf("const runSharedDailySpotMutation"), source.indexOf("const getSharedSpotItem"));
  assert.match(runner, /requestScopeKey[\s\S]*requestScopeGeneration[\s\S]*requestToken/);
  assert.match(runner, /if \(!isCurrentRequest\(\)\)[\s\S]*return false/g);
  assert.match(runner, /result\.status !== "success"[\s\S]*return false[\s\S]*const loaded = await loadDailyData/);
  assert.doesNotMatch(runner, /appRepository|setSpotAdditions|setSpotDeadlines|setTemporaryTodayOnlyItems/);
});

test("pending shared spot work prevents duplicate and competing daily operations", () => {
  assert.match(source, /sharedSpotMutationRequestRef\.current \|\|[\s\S]*pendingDailyItemMutationRequestsRef\.current\.size > 0/);
  assert.match(source, /if \(sharedSessionMutationRequestRef\.current\)[\s\S]*if \(sharedSpotMutationRequestRef\.current\)/);
  assert.match(source, /disabled=!canRunTodaySpotMutation|disabled=\{!canRunTodaySpotMutation\}/);
});
