import assert from "node:assert/strict";
import test from "node:test";
import {
  assertValidHomeItemQuantity,
  assertValidHomeRoughUnit,
  splitHomeItemUnitLines,
} from "../src/lib/home-item-template-constraints";

test("accepts durable item quantities from zero through five", () => {
  assert.doesNotThrow(() => assertValidHomeItemQuantity(0));
  assert.doesNotThrow(() => assertValidHomeItemQuantity(1));
  assert.doesNotThrow(() => assertValidHomeItemQuantity(5));
});

test("rejects durable item quantities outside zero through five", () => {
  for (const quantity of [-1, 1.5, 6, 10, 11, 999, 1000]) {
    assert.throws(
      () => assertValidHomeItemQuantity(quantity),
      /invalid_home_item_quantity/,
    );
  }
});

test("accepts rough units through ten characters and rejects eleven", () => {
  assert.doesNotThrow(() => assertValidHomeRoughUnit(""));
  assert.doesNotThrow(() => assertValidHomeRoughUnit("a".repeat(5)));
  assert.doesNotThrow(() => assertValidHomeRoughUnit("a".repeat(10)));
  assert.throws(
    () => assertValidHomeRoughUnit("a".repeat(11)),
    /invalid_home_rough_unit/,
  );
});

test("splits units over five characters into complete lines without omission", () => {
  assert.deepEqual(splitHomeItemUnitLines("12345"), ["12345"]);
  assert.deepEqual(splitHomeItemUnitLines("123456"), ["12345", "6"]);
  assert.deepEqual(splitHomeItemUnitLines("1234567890"), ["12345", "67890"]);
});
