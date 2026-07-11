import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSafeFamilyRedirectPath } from "../../../../src/lib/auth/redirect";
import { getSupabaseEnv } from "../../../../src/lib/env";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = getSafeFamilyRedirectPath(requestUrl.searchParams.get("next"));

  if (!code) {
    const authUrl = new URL("/family/auth", requestUrl.origin);
    authUrl.searchParams.set("error", "missing_code");
    authUrl.searchParams.set("next", nextPath);

    return NextResponse.redirect(authUrl);
  }

  const redirectUrl = new URL(nextPath, requestUrl.origin);
  const response = NextResponse.redirect(redirectUrl);
  const { supabaseUrl, supabasePublishableKey } = getSupabaseEnv();
  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });
  const {
    data: { session },
    error,
  } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !session) {
    const authUrl = new URL("/family/auth", requestUrl.origin);
    authUrl.searchParams.set("error", "callback_failed");
    authUrl.searchParams.set("next", nextPath);

    return NextResponse.redirect(authUrl);
  }

  return response;
}
