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
  assert.match(runner, /executeHomeSharedDailySpotMutation\([\s\S]*setSharedDailyState\(execution\.state\)/);
  assert.doesNotMatch(runner, /saveSpotAdditions|saveSpotDeadlines|saveTodayOnlyTemporaryItems|localStorage/);
  assert.doesNotMatch(runner, /applyUpdatedItemToSharedDailyState/);
});

test("shared failure has no local fallback and stale mutation or reload cannot apply", () => {
  const runner = source.slice(source.indexOf("const runSharedDailySpotMutation"), source.indexOf("const getSharedSpotItem"));
  assert.match(runner, /requestScopeKey[\s\S]*requestScopeGeneration[\s\S]*requestToken/);
  assert.match(runner, /if \(!isCurrentRequest\(\)\)[\s\S]*return false/g);
  assert.match(
    runner,
    /execution\.status === "mutation_failure"[\s\S]*return false[\s\S]*execution\.status === "reload_failure"/,
  );
  assert.doesNotMatch(runner, /appRepository|setSpotAdditions|setSpotDeadlines|setTemporaryTodayOnlyItems/);
});

test("pending shared spot work prevents duplicate and competing daily operations", () => {
  assert.match(source, /sharedSpotMutationRequestRef\.current \|\|[\s\S]*pendingDailyItemMutationRequestsRef\.current\.size > 0/);
  assert.match(source, /if \(sharedSessionMutationRequestRef\.current\)[\s\S]*if \(sharedSpotMutationRequestRef\.current\)/);
  assert.match(source, /disabled=!canRunTodaySpotMutation|disabled=\{!canRunTodaySpotMutation\}/);
});

test("actual spot plus click routes unselected add and selected removal through the shared runner", () => {
  const optionButton = source.slice(
    source.indexOf("const itemButton = ("),
    source.indexOf("if (!isTemporaryItem)"),
  );
  const toggleHandler = source.slice(
    source.indexOf("const toggleSpotItem ="),
    source.indexOf("const saveSpotDeadline ="),
  );
  const addHandler = source.slice(
    source.indexOf("const addSpotItem ="),
    source.indexOf("const removeSpotItem ="),
  );
  const removeHandler = source.slice(
    source.indexOf("const removeSpotItem ="),
    source.indexOf("const toggleSpotItem ="),
  );

  assert.match(optionButton, /onClick=\{\(\) => toggleSpotItem\(item\.id\)\}/);
  assert.match(
    toggleHandler,
    /selectedTodayOnlyIds\.includes\(itemId\)[\s\S]*removeSpotItem\(itemId\)[\s\S]*addSpotItem\(itemId/,
  );
  assert.match(
    addHandler,
    /runSharedDailySpotMutation\(\{[\s\S]*action: "add_template"/,
  );
  assert.match(
    removeHandler,
    /runSharedDailySpotMutation\(\{[\s\S]*action: "delete"/,
  );
});

test("completed shared sessions permit check-side spot corrections", () => {
  assert.match(
    source,
    /const canRunTodaySpotAddMutation =[\s\S]*dailyMode === "shared-success"[\s\S]*!isSharedSessionMutationPending[\s\S]*!isSharedSpotMutationPending/,
  );
  assert.doesNotMatch(
    source.slice(
      source.indexOf("const canRunTodaySpotAddMutation ="),
      source.indexOf("const canRunTodaySpotMutation ="),
    ),
    /completedAt|isCompleted/,
  );
  assert.match(
    source,
    /const canRunTodaySpotMutation =[\s\S]*canRunTodaySpotAddMutation[\s\S]*!session\?\.completedAt/,
  );
  assert.match(
    source,
    /currentSharedSession\.isCompleted[\s\S]*isHomeCompletedSpotCorrectionAction\(input\.action\)/,
  );
  assert.match(
    source,
    /const addTemporaryTodayOnlyItem[\s\S]*if \(!canRunTodaySpotAddMutation\)/,
  );
});

test("shared rough state remains independent of daily completion for every member", () => {
  const handler = source.slice(
    source.indexOf("const toggleRoughState = async"),
    source.indexOf("const runSharedDailySpotMutation = async"),
  );
  const roughCard = source.slice(
    source.indexOf('title="ざっくり管理"'),
    source.indexOf('{activeTab === "items"'),
  );
  assert.match(handler, /saveHomeRoughState\([\s\S]*updateSharedRoughItemState/);
  assert.match(handler, /executeHomeSharedRoughMutation\([\s\S]*reloadCanonical: reloadSharedDurableSettings/);
  assert.doesNotMatch(
    handler,
    /isSharedDailyPreparationCompleted|completedAt|isCompleted/,
  );
  assert.match(roughCard, /roughStateEditable && !isSaving/);
  assert.doesNotMatch(roughCard, /isSharedDailyPreparationCompleted/);
  assert.match(
    handler,
    /executeHomeSharedRoughMutation\([\s\S]*reloadCanonical: reloadSharedDurableSettings/,
  );
});
