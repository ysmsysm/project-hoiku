import HomeClient from "./HomeClient";
import { getCurrentUserResult } from "../src/lib/auth/session";
import { getCurrentFamilyMembership } from "../src/lib/family-sharing/membership";
import { loadSharedSettingsForFamily } from "../src/lib/family-sharing/shared-settings-server";
import { loadSharedDailyDataForFamily } from "../src/lib/family-sharing/shared-daily-data-server";
import { getHomeDataSource } from "../src/lib/home-data-source-server";
import { getJapanDateString } from "../src/lib/japan-date";

export default async function Home() {
  const dataSource = await getHomeDataSource({
    getCurrentUserResult,
    getCurrentFamilyMembership,
    loadSharedSettingsForFamily,
    getJapanDateString,
    loadSharedDailyDataForFamily,
  });

  return <HomeClient dataSource={dataSource} />;
}
