import HomeClient from "./HomeClient";
import { getCurrentUserIdentityResultWithClient } from "../src/lib/auth/session";
import { getCurrentFamilyMembershipWithClient } from "../src/lib/family-sharing/membership";
import { loadSharedSettingsWithClient } from "../src/lib/family-sharing/shared-settings-query";
import { loadSharedDailyDataForFamily } from "../src/lib/family-sharing/shared-daily-data-server";
import { getHomeDataSource } from "../src/lib/home-data-source-server";
import { getJapanDateString } from "../src/lib/japan-date";
import { createClient } from "../src/lib/supabase/server";

type HomeProps = {
  searchParams: Promise<{
    tab?: string | string[];
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const dataSourcePromise = createClient().then((supabase) =>
    getHomeDataSource(
      {
        getCurrentUserIdentityResult: () =>
          getCurrentUserIdentityResultWithClient(supabase),
        getCurrentFamilyMembership: (user) =>
          getCurrentFamilyMembershipWithClient(supabase, user),
        loadSharedSettingsForFamily: (familyId) =>
          loadSharedSettingsWithClient(supabase, familyId),
        getJapanDateString,
        loadSharedDailyDataForFamily,
      },
      { deferSharedDailyData: true },
    ),
  );
  const [params, dataSource] = await Promise.all([
    searchParams,
    dataSourcePromise,
  ]);
  const initialTab = params.tab === "settings" ? "settings" : "check";

  return <HomeClient dataSource={dataSource} initialTab={initialTab} />;
}
