import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const homePage = readFileSync("app/page.tsx", "utf8");
const homeClient = readFileSync("app/HomeClient.tsx", "utf8");
const familyPage = readFileSync("app/family/page.tsx", "utf8");
const sharedDailyAction = readFileSync(
  "app/shared-daily-actions.ts",
  "utf8",
);
const membership = readFileSync(
  "src/lib/family-sharing/membership.ts",
  "utf8",
);
const membershipQuery = readFileSync(
  "src/lib/family-sharing/membership-query.ts",
  "utf8",
);

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

test("settings prefetches the family route before its row is selected", () => {
  assert.match(
    homeClient,
    /if \(activeTab === "settings"\) \{\s*router\.prefetch\("\/family"\);\s*\}/,
  );
  assert.match(homeClient, /\[activeTab, router\]/);
});

test("membership reuses its embedded family status without a second query", () => {
  assert.match(
    membershipQuery,
    /families!family_members_family_id_fkey\(sharing_started_at\)/,
  );
  assert.match(
    membership,
    /const membershipRow = data as CurrentFamilyMembershipRow;[\s\S]*return mapCurrentFamilyMembershipRow\(membershipRow\);/,
  );
  assert.match(membership, /familyRows === null/);
  assert.doesNotMatch(membership, /\.from\("families"\)/);
  assert.doesNotMatch(membership, /\.select\("sharing_started_at"\)/);
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

test("settings return is one-shot so a later local or shared reload defaults to check", () => {
  assert.match(
    homeClient,
    /if \(initialTab !== "settings"\) \{\s*return;\s*\}/,
  );
  assert.match(
    homeClient,
    /currentUrl\.searchParams\.get\("tab"\) !== "settings"/,
  );
  assert.match(homeClient, /currentUrl\.searchParams\.delete\("tab"\)/);
  assert.match(
    homeClient,
    /window\.history\.replaceState\([\s\S]*?currentUrl\.pathname[\s\S]*?currentUrl\.search[\s\S]*?currentUrl\.hash/,
  );
  const normalizationEffect = homeClient.slice(
    homeClient.indexOf('if (initialTab !== "settings")'),
    homeClient.indexOf("const startDeferredSharedDailyLoad"),
  );
  assert.doesNotMatch(
    normalizationEffect,
    /dataSource|router\.(?:push|replace|refresh)|setActiveTab/,
  );
  assert.match(homePage, /params\.tab === "settings" \? "settings" : "check"/);
});

test("settings return renders before shared daily bootstrap and loads it fresh", () => {
  assert.match(
    homePage,
    /\{ deferSharedDailyData: initialTab === "settings" \}/,
  );
  assert.match(sharedDailyAction, /^"use server";/);
  assert.match(
    sharedDailyAction,
    /return loadSharedDailyDataForFamily\(input\);/,
  );
  assert.match(
    homeClient,
    /dataSource\.initialDailyData\.status !== "loading"/,
  );
  assert.match(homeClient, /loadHomeSharedDailyData\(\{/);
  assert.match(
    homeClient,
    /sharedDailyStateRef\.current = loaded;\s*setSharedDailyState\(loaded\);/,
  );
});

test("shared daily tabs wait for the deferred canonical result", () => {
  assert.match(
    homeClient,
    /if \(pendingTab\) \{\s*pendingSharedDailyTabRef\.current = pendingTab;/,
  );
  assert.match(
    homeClient,
    /const pendingTab = pendingSharedDailyTabRef\.current;[\s\S]*setActiveTab\(pendingTab\);/,
  );
  assert.match(
    homeClient,
    /if \(startDeferredSharedDailyLoad\(nextTab\)\) \{\s*return;/,
  );
  assert.match(
    homeClient,
    /deferredSharedDailyNavigationReadyRef\.current = true;\s*setActiveTab\(pendingTab\);/,
  );
  assert.match(
    homeClient,
    /<BottomNav activeTab=\{activeTab\} onChange=\{changeActiveTab\} \/>/,
  );
});

test("family auth and setup routes remain unchanged", () => {
  assert.match(familyPage, /redirect\("\/family\/auth\?next=\/family"\)/);
  assert.match(familyPage, /membership \? \(/);
  assert.match(familyPage, /<CreateFamilyButton \/>/);
  assert.match(familyPage, /<FamilyDataSharingStart initialMembership=\{membership\} \/>/);
});
