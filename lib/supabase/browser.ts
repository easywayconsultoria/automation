"use client";
import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env/public";

export function createClient() {
  const env = publicEnv();
  return createBrowserClient(env.url, env.anonKey);
}
