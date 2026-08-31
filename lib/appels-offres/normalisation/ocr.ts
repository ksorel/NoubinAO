import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import Anthropic from "@anthropic-ai/sdk";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const anthropic = new Anthropic();

// `pdf-parse` (utilisé par pdf.ts) embarque sa propre copie (plus ancienne)
// de pdfjs-dist en dépendance imbriquée. Les deux copies partagent un état
// global côté pdfjs-dist (fake worker Node) : sans fixer explicitement
// `workerSrc` sur NOTRE copie (résolu en URL file://, requis par le loader
// ESM de Node sous Windows), le fake worker peut se retrouver résolu vers
// celle de pdf-parse, provoquant "API version does not match Worker
// version".
const require = createRequire(import.meta.url);
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
).href;

export async function rendreImagePage(buffer: Buffer, numeroPage: number): Promise<Buffer> {
  // Si `pdf.ts` (pdf-parse) a déjà tourné dans ce process, il a laissé
  // `globalThis.pdfjsWorker` pointer vers SA copie (plus ancienne) de
  // pdfjs-dist — pdfjs-dist réutilise ce global sans revérifier `workerSrc`.
  // On le vide pour forcer le rechargement depuis notre propre `workerSrc`.
  delete (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker;

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
