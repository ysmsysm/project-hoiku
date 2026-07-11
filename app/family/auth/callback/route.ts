import { NextRequest, NextResponse } from "next/server";
import { getSafeFamilyRedirectPath } from "../../../../src/lib/auth/redirect";
import { createClient } from "../../../../src/lib/supabase/server";

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

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const authUrl = new URL("/family/auth", requestUrl.origin);
    authUrl.searchParams.set("error", "callback_failed");
    authUrl.searchParams.set("next", nextPath);

    return NextResponse.redirect(authUrl);
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const authUrl = new URL("/family/auth", requestUrl.origin);
    authUrl.searchParams.set("error", "callback_failed");
    authUrl.searchParams.set("next", nextPath);

    return NextResponse.redirect(authUrl);
  }

  return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
}
