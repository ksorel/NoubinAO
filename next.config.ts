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
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
