import assert from "node:assert/strict";
import test from "node:test";
import { getJapanDateString } from "../src/lib/japan-date";

function utcDateWithFullYear(year: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, 0, 1);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

test("normalizes supported years to exactly four digits", () => {
  for (const [year, expected] of [
    [1, "0001-01-01"],
    [9, "0009-01-01"],
    [99, "0099-01-01"],
    [999, "0999-01-01"],
    [1000, "1000-01-01"],
    [2026, "2026-01-01"],
  ] as const) {
    assert.equal(getJapanDateString(utcDateWithFullYear(year)), expected);
  }
});

test("rejects years outside the supported AD 1 through 9999 range", () => {
  assert.throws(
    () => getJapanDateString(utcDateWithFullYear(0)),
    RangeError,
  );
  assert.throws(
    () => getJapanDateString(utcDateWithFullYear(10_000)),
    RangeError,
  );
});

test("formats instants before and at the Japan date boundary", () => {
  assert.equal(
    getJapanDateString(new Date("2026-07-28T14:59:59.000Z")),
    "2026-07-28",
  );
  assert.equal(
    getJapanDateString(new Date("2026-07-28T15:00:00.000Z")),
    "2026-07-29",
  );
});

test("handles month-end and year-end rollover in Asia/Tokyo", () => {
  assert.equal(
    getJapanDateString(new Date("2026-01-31T15:00:00.000Z")),
    "2026-02-01",
  );
  assert.equal(
    getJapanDateString(new Date("2026-12-31T15:00:00.000Z")),
    "2027-01-01",
  );
});

test("does not mutate its Date input", () => {
  const date = new Date("2026-07-28T15:00:00.000Z");
  const timestamp = date.getTime();

  getJapanDateString(date);

  assert.equal(date.getTime(), timestamp);
});

test("rejects an invalid Date explicitly", () => {
  assert.throws(
    () => getJapanDateString(new Date(Number.NaN)),
    (error) =>
      error instanceof RangeError && error.message === "Invalid date",
  );
});
