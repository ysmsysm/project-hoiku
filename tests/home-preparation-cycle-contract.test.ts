import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/HomeClient.tsx", "utf8");

test("local confirmation rebuilds every preparation kind with clean flags", () => {
  const builder = source.slice(
    source.indexOf("const buildPreparationItems ="),
    source.indexOf("export default function HomeClient"),
  );
  const completeCheck = source.slice(
    source.indexOf("const completeCheck ="),
    source.indexOf("const togglePreparationItem ="),
  );
  assert.match(builder, /checked: false,[\s\S]*later: false/);
  assert.match(completeCheck, /createLockerPreparationItems\(\)/);
  assert.match(completeCheck, /createTodayOnlyPreparationItems\(\)/);
  assert.match(completeCheck, /createRoughPreparationItems\(\)/);
  assert.match(completeCheck, /createPreparationSession/);
  assert.match(completeCheck, /nextSession\.completedAt = null/);
});

test("shared recheck uses canonical reload rather than local preparation state", () => {
  const handler = source.slice(
    source.indexOf("const runSharedCompleteCheck ="),
    source.indexOf("const completeCheck ="),
  );
  assert.match(handler, /completeDailyCheck[\s\S]*loadDailyData/);
  assert.match(handler, /applyCheckedSessionToSharedDailyState/);
  assert.match(handler, /setSharedDailyState/);
  assert.doesNotMatch(handler, /updateSession\(|createPreparationSession/);
});
