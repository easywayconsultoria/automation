import { z } from "zod";

const schema = z.object({
  url: z.string().url(),
  anonKey: z.string().min(20)
});

export function publicEnv() {
  const parsed = schema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  });
  if (!parsed.success)
    throw new Error(
      "Supabase public environment variables are missing or invalid."
    );
  return parsed.data;
}
