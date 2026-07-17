import HomeClient from "./HomeClient";
import { getCurrentUserResult } from "../src/lib/auth/session";
import { getCurrentFamilyMembership } from "../src/lib/family-sharing/membership";
import { loadSharedSettingsForFamily } from "../src/lib/family-sharing/shared-settings-server";
import { getHomeDataSource } from "../src/lib/home-data-source-server";

export default async function Home() {
  const dataSource = await getHomeDataSource({
    getCurrentUserResult,
    getCurrentFamilyMembership,
    loadSharedSettingsForFamily,
  });

  return <HomeClient dataSource={dataSource} />;
}
