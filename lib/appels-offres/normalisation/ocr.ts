import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import Anthropic from "@anthropic-ai/sdk";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// maxRetries par défaut du SDK (2) s'est révélé insuffisant en pratique :
// une vraie erreur 529 "Overloaded" d'Anthropic a fait échouer un
// traitement réel (2026-09-03). Le SDK gère déjà lui-même le backoff sur
// les erreurs transitoires (529/429/500/503) — augmenter maxRetries plutôt
// que réinventer une logique de nouvelle tentative maison.
const anthropic = new Anthropic({ maxRetries: 4 });

let workerSrcInitialise = false;

// `require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")` (via
// createRequire) renvoie un identifiant de module numérique interne à
// Turbopack en production ("The 'path' argument must be of type string.
// Received type number") plutôt qu'un vrai chemin de fichier — même
// piège que celui documenté pour `pdf-parse` (voir la mémoire du
// sous-projet), qui touche ici aussi une résolution de sous-chemin
// pourtant censée être fiable : la différence est que ce sous-chemin est
// désormais résolu pour CHAQUE PDF traité (pdf.ts l'appelle
// systématiquement), pas seulement en repli OCR occasionnel, ce qui l'a
// exposé à un contexte de bundling où require.resolve() casse.
// Construction directe du chemin depuis `process.cwd()` (racine du projet
// dans la fonction serverless) pour contourner entièrement
// `require.resolve()`.
//
// Exportée : pdf.ts (extraction de texte + structure via pdfjs-dist)
// réutilise cette même initialisation plutôt que d'en dupliquer une —
// depuis le retrait de pdf-parse (qui embarquait sa propre copie imbriquée
// de pdfjs-dist), une seule copie du paquet est en jeu dans tout le
// pipeline PDF.
export function initialiserWorkerSrc(): void {
  if (workerSrcInitialise) return;

  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
    join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
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
