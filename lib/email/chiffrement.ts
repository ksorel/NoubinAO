import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHME = "aes-256-gcm";

function obtenirCle(): Buffer {
  const cle = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
  if (!cle) throw new Error("EMAIL_TOKEN_ENCRYPTION_KEY manquante");
  return Buffer.from(cle, "base64");
}

export function chiffrer(texteClair: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHME, obtenirCle(), iv);
  const chiffre = Buffer.concat([
    cipher.update(texteClair, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, chiffre].map((b) => b.toString("base64")).join(".");
}

export function dechiffrer(texteChiffre: string): string {
  const [ivB64, authTagB64, chiffreB64] = texteChiffre.split(".");
  const decipher = createDecipheriv(
    ALGORITHME,
    obtenirCle(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const clair = Buffer.concat([
    decipher.update(Buffer.from(chiffreB64, "base64")),
    decipher.final(),
  ]);
  return clair.toString("utf8");
}
