import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import Anthropic from "@anthropic-ai/sdk";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// maxRetries par défaut du SDK (2) s'est révélé insuffisant en pratique :
// une vraie erreur 529 "Overloaded" d'Anthropic a fait échouer un
// traitement réel (2026-09-03). Le SDK gère déjà lui-même le backoff sur
// les erreurs transitoires (529/429/500/503) — augmenter maxRetries plutôt
// que réinventer une logique de nouvelle tentative maison.
const anthropic = new Anthropic({ maxRetries: 4 });

let workerSrcInitialise = false;

// Next.js exécute une étape de build ("Collecting page data") qui importe
// ce module pour inspecter sa configuration, sans jamais appeler
// `rendreImagePage` — dans cet environnement de build, ni
// `createRequire(...).resolve(...)` ni `import.meta.resolve` ne se
// comportent comme du vrai Node (résolution par identifiant numérique de
// module chez Turbopack, ou fonction absente). Initialiser `workerSrc` au
// premier appel réel plutôt qu'au chargement du module évite que ce code
// s'exécute pendant cette étape de build.
//
// Exportée : pdf.ts (extraction de texte + structure via pdfjs-dist)
// réutilise cette même initialisation plutôt que d'en dupliquer une —
// depuis le retrait de pdf-parse (qui embarquait sa propre copie imbriquée
// de pdfjs-dist), une seule copie du paquet est en jeu dans tout le
// pipeline PDF.
export function initialiserWorkerSrc(): void {
  if (workerSrcInitialise) return;

  const require = createRequire(import.meta.url);
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
    require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ).href;
  workerSrcInitialise = true;
}

export async function rendreImagePage(buffer: Buffer, numeroPage: number): Promise<Buffer> {
  initialiserWorkerSrc();

  const document = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await document.getPage(numeroPage);
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = createCanvas(viewport.width, viewport.height);
  const contexte = canvas.getContext("2d");

  await page.render({
    canvas: null,
    canvasContext: contexte as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;

  return canvas.toBuffer("image/png");
}

export async function lireImageParClaude(imageBuffer: Buffer): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: imageBuffer.toString("base64"),
            },
          },
          {
            type: "text",
            text: "Transcris fidèlement tout le texte visible sur cette image de document administratif, sans commentaire ni reformulation.",
          },
        ],
      },
    ],
  });

  const bloc = message.content.find((b) => b.type === "text");
  return bloc && bloc.type === "text" ? bloc.text : "";
}
