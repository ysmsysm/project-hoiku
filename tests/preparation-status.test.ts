import assert from "node:assert/strict";
import test from "node:test";
import {
  getPreparationCompletedAt,
  isPreparationSessionCompleted,
} from "../src/lib/preparation-status";
import type { PreparationSession } from "../src/types/preparation";

const completedAt = "2026-07-14T09:00:00.000Z";

test("treats completedAt as the source of preparation completion", () => {
  const session: PreparationSession = {
    checkedBy: "ママ",
    confirmedAt: "2026-07-14T08:30:00.000Z",
    completedAt,
    items: [],
    thanksSent: false,
  };

  assert.equal(getPreparationCompletedAt(session), completedAt);
  assert.equal(isPreparationSessionCompleted(session), true);
});

test("keeps preparation completed when carryover items remain", () => {
  const session: PreparationSession = {
    checkedBy: "ママ",
    confirmedAt: "2026-07-14T08:30:00.000Z",
    completedAt,
    items: [
      {
        id: "template-spot",
        name: "Letter",
        unit: "枚",
        count: 1,
        checked: false,
        later: false,
        carryover: true,
        source: "spot",
      },
    ],
    thanksSent: false,
  };

  assert.equal(getPreparationCompletedAt(session), completedAt);
  assert.equal(isPreparationSessionCompleted(session), true);
});

test("treats missing completedAt as not completed", () => {
  const session: PreparationSession = {
    checkedBy: "ママ",
    confirmedAt: "2026-07-14T08:30:00.000Z",
    completedAt: null,
    items: [],
    thanksSent: false,
  };

  assert.equal(getPreparationCompletedAt(session), null);
  assert.equal(isPreparationSessionCompleted(session), false);
});
