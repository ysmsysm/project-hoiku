import type { Session, User } from "@supabase/supabase-js";
import { createClient } from "../supabase/server";

export type CurrentUserResult =
  | { status: "authenticated"; user: User }
  | { status: "unauthenticated" }
  | { status: "error"; error: unknown };

export async function getCurrentSession(): Promise<Session | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session;
}

export async function getCurrentUserResult(): Promise<CurrentUserResult> {
  const supabase = await createClient();
  let authResult;

  try {
    authResult = await supabase.auth.getUser();
  } catch (error) {
    logCurrentUserError(error);
    return { status: "error", error };
  }

  const {
    data: { user },
    error,
  } = authResult;

  if (error) {
    if (isAuthSessionMissingError(error)) {
      return { status: "unauthenticated" };
    }

    logCurrentUserError(error);
    return { status: "error", error };
  }

  if (!user) {
    return { status: "unauthenticated" };
  }

  return { status: "authenticated", user };
}

export async function getCurrentUser(): Promise<User | null> {
  const result = await getCurrentUserResult();

  return result.status === "authenticated" ? result.user : null;
}

function logCurrentUserError(error: unknown) {
  console.error("Failed to verify current user session", toLoggableError(error));
}

export function isAuthSessionMissingError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  return (
    ("name" in error && error.name === "AuthSessionMissingError") ||
    ("message" in error && error.message === "Auth session missing!")
  );
}

function toLoggableError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return { message: String(error) };
  }

  return {
    name: "name" in error ? error.name : undefined,
    message: "message" in error ? error.message : undefined,
    status: "status" in error ? error.status : undefined,
    code: "code" in error ? error.code : undefined,
  };
}
