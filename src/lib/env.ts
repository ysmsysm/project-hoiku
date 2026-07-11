const getRequiredEnv = (name: keyof NodeJS.ProcessEnv) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required to create a Supabase client.`);
  }

  return value;
};

export const getSupabaseEnv = () => ({
  supabaseUrl: getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: getRequiredEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ),
});
