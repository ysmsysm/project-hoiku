import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "./src/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: ["/family/:path*"],
};
