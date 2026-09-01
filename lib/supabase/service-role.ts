import { createClient } from "@supabase/supabase-js";

/**
 * Client Supabase avec la clé service-role : contourne RLS entièrement.
 * Ne jamais importer depuis du code exposé au navigateur (composants
 * client, Server Actions déclenchées directement par l'utilisateur) —
 * réservé aux contextes serveur sans session utilisateur (jobs
 * d'arrière-plan, webhooks signés).
 */
export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
