import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except :
     * - api (routes API — gèrent leur propre authentification ; ex.
     *   /api/dao/traiter vérifie la signature QStash, pas de cookie de
     *   session. Un appelant externe comme QStash n'a jamais de session
     *   Supabase, et se faisait rediriger vers /auth/login — une page,
     *   qui refuse POST, d'où un 405 avant même d'atteindre le code de
     *   la route.)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
