import HomeClient from "./HomeClient";
import { getCurrentUserResult } from "../src/lib/auth/session";
import { getCurrentFamilyMembership } from "../src/lib/family-sharing/membership";
import { loadSharedSettingsForFamily } from "../src/lib/family-sharing/shared-settings-server";
import { loadSharedDailyDataForFamily } from "../src/lib/family-sharing/shared-daily-data-server";
import { getHomeDataSource } from "../src/lib/home-data-source-server";
import { getJapanDateString } from "../src/lib/japan-date";

type HomeProps = {
  searchParams: Promise<{
    tab?: string | string[];
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const initialTab = params.tab === "settings" ? "settings" : "check";
  const dataSource = await getHomeDataSource(
    {
      getCurrentUserResult,
      getCurrentFamilyMembership,
      loadSharedSettingsForFamily,
      getJapanDateString,
      loadSharedDailyDataForFamily,
    },
    { deferSharedDailyData: initialTab === "settings" },
  );

  return <HomeClient dataSource={dataSource} initialTab={initialTab} />;
}
