import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const homePage = readFileSync("app/page.tsx", "utf8");
const homeClient = readFileSync("app/HomeClient.tsx", "utf8");
const familyPage = readFileSync("app/family/page.tsx", "utf8");

test("implemented family settings row navigates to the existing family route", () => {
  assert.match(
    homeClient,
    /id: "family", label: "家族共有", status: "", enabled: true/,
  );
  assert.match(
    homeClient,
    /if \(item\.id === "family"\) \{\s*router\.push\("\/family"\);/,
  );
  assert.match(
    homeClient,
    /item\.id === "family"[\s\S]{0,100}<ChevronRight/,
  );
  assert.match(
    homeClient,
    /id: "notification", label: "通知設定", status: "準備中", enabled: false/,
  );
});

test("family page returns to an explicitly requested settings tab", () => {
  assert.match(familyPage, /href="\/\?tab=settings"/);
  assert.match(familyPage, />\s*設定へ戻る\s*<\/Link>/);
  assert.match(homePage, /params\.tab === "settings" \? "settings" : "check"/);
  assert.match(
    homePage,
    /<HomeClient dataSource=\{dataSource\} initialTab=\{initialTab\} \/>/,
  );
  assert.match(homeClient, /useState<AppTab>\(initialTab\)/);
});

test("family auth and setup routes remain unchanged", () => {
  assert.match(familyPage, /redirect\("\/family\/auth\?next=\/family"\)/);
  assert.match(familyPage, /membership \? \(/);
  assert.match(familyPage, /<CreateFamilyButton \/>/);
  assert.match(familyPage, /<FamilyDataSharingStart initialMembership=\{membership\} \/>/);
});
