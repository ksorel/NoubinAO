import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // @napi-rs/canvas embarque un binaire natif (.node) via js-binding.js —
  // Turbopack ne peut pas l'empaqueter en chunk ESM ("non-ecmascript
  // placeable asset"). L'exclure force un require() Node natif à
  // l'exécution, ce que la fonction serverless supporte nativement.
  // (pdfjs-dist n'a pas besoin d'être listé ici : Turbopack refuse de toute
  // façon d'externaliser son sous-chemin .mjs — voir le commentaire dans
  // lib/appels-offres/normalisation/ocr.ts pour le vrai correctif.)
  serverExternalPackages: ["@napi-rs/canvas"],
  experimental: {
    serverActions: {
      // Next.js limite par défaut le corps d'une Server Action à 1 Mo —
      // très inférieur à TAILLE_MAX_OCTETS (20 Mo) déjà validé côté Zod
      // dans lib/appels-offres/schema.ts. Un DAO réel (PDF scanné, DOCX
      // mis en forme) dépasse presque toujours 1 Mo, donc l'upload était
      // rejeté par Next.js avant même d'atteindre televerserDao.
      bodySizeLimit: "21mb",
    },
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
