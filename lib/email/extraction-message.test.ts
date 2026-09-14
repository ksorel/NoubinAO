import { describe, expect, it } from "vitest";
import { extraireCorpsTexte, collecterPiecesJointes } from "./extraction-message";

// Base64url de "Bonjour, ceci est le corps en texte brut."
const CORPS_PLAIN_B64URL =
  "Qm9uam91ciwgY2VjaSBlc3QgbGUgY29ycHMgZW4gdGV4dGUgYnJ1dC4=";
// Base64url de "<p>Bonjour, <b>corps</b> en HTML.</p>"
const CORPS_HTML_B64URL = "PHA-Qm9uam91ciwgPGI-Y29ycHM8L2I-IGVuIEhUTUwuPC9wPg==";

describe("extraireCorpsTexte", () => {
  it("retourne null si le payload est undefined", () => {
    expect(extraireCorpsTexte(undefined)).toBeNull();
  });

  it("extrait un message text/plain simple (pas de parts)", () => {
    const payload = {
      mimeType: "text/plain",
      body: { data: CORPS_PLAIN_B64URL },
    };
    expect(extraireCorpsTexte(payload)).toBe(
      "Bonjour, ceci est le corps en texte brut.",
    );
  });

  it("préfère text/plain à text/html dans un message multipart", () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/html", body: { data: CORPS_HTML_B64URL } },
        { mimeType: "text/plain", body: { data: CORPS_PLAIN_B64URL } },
      ],
    };
    expect(extraireCorpsTexte(payload)).toBe(
      "Bonjour, ceci est le corps en texte brut.",
    );
  });

  it("replie sur text/html (tags retirés) si aucun text/plain", () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [{ mimeType: "text/html", body: { data: CORPS_HTML_B64URL } }],
    };
    expect(extraireCorpsTexte(payload)).toBe(
      " Bonjour,  corps  en HTML. ",
    );
  });

  it("retourne null si aucune partie textuelle n'est trouvée", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "application/pdf",
          filename: "addenda.pdf",
          body: { size: 1024 },
        },
      ],
    };
    expect(extraireCorpsTexte(payload)).toBeNull();
  });

  it("descend récursivement dans des parts imbriquées", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [{ mimeType: "text/plain", body: { data: CORPS_PLAIN_B64URL } }],
        },
        {
          mimeType: "application/pdf",
          filename: "addenda.pdf",
          body: { size: 1024 },
        },
      ],
    };
    expect(extraireCorpsTexte(payload)).toBe(
      "Bonjour, ceci est le corps en texte brut.",
    );
  });

  it("ignore une pièce jointe text/plain et trouve le vrai corps du message", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "text/plain",
          filename: "notes.txt",
          body: { data: "Q2VjaSBlc3QgdW5lIHBpw6hjZSBqb2ludGUu" },
        },
        { mimeType: "text/plain", body: { data: CORPS_PLAIN_B64URL } },
      ],
    };
    expect(extraireCorpsTexte(payload)).toBe(
      "Bonjour, ceci est le corps en texte brut.",
    );
  });

  it("retire le contenu des blocs <style> avant de retirer les balises (fallback HTML)", () => {
    // Base64url de "<style>.a{color:red}</style><p>Bonjour, corps en HTML.</p>"
    const html =
      "<style>.a{color:red}</style><p>Bonjour, corps en HTML.</p>";
    const b64url = Buffer.from(html, "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const payload = {
      mimeType: "multipart/alternative",
      parts: [{ mimeType: "text/html", body: { data: b64url } }],
    };
    const resultat = extraireCorpsTexte(payload);
    expect(resultat).not.toContain("color:red");
    expect(resultat).toContain("Bonjour, corps en HTML.");
  });
});

describe("collecterPiecesJointes", () => {
  it("retourne une entrée correcte pour un message avec une pièce jointe", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "application/pdf",
          filename: "addenda.pdf",
          body: { size: 2048 },
        },
      ],
    };
    expect(collecterPiecesJointes(payload)).toEqual([
      { nom: "addenda.pdf", tailleOctets: 2048, typeMime: "application/pdf" },
    ]);
  });

  it("trouve une pièce jointe imbriquée dans des parts dans des parts", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/related",
          parts: [
            {
              mimeType: "application/vnd.ms-excel",
              filename: "financier.xls",
              body: { size: 4096 },
            },
          ],
        },
      ],
    };
    expect(collecterPiecesJointes(payload)).toEqual([
      { nom: "financier.xls", tailleOctets: 4096, typeMime: "application/vnd.ms-excel" },
    ]);
  });

  it("retourne un tableau vide si le message n'a aucune pièce jointe", () => {
    const payload = {
      mimeType: "text/plain",
      body: { data: CORPS_PLAIN_B64URL },
    };
    expect(collecterPiecesJointes(payload)).toEqual([]);
  });

  it("utilise 0 par défaut si body.size est absent, sans lever d'exception", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [{ mimeType: "application/pdf", filename: "sans-taille.pdf" }],
    };
    expect(() => collecterPiecesJointes(payload)).not.toThrow();
    expect(collecterPiecesJointes(payload)).toEqual([
      { nom: "sans-taille.pdf", tailleOctets: 0, typeMime: "application/pdf" },
    ]);
  });

  it("ne contient jamais le contenu (data) de la pièce jointe — métadonnées uniquement", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "application/pdf",
          filename: "addenda.pdf",
          body: { size: 2048, data: "JVBERi0xLjQK" },
        },
      ],
    };
    const resultat = collecterPiecesJointes(payload);
    expect(resultat).toHaveLength(1);
    expect(resultat[0]).not.toHaveProperty("data");
    expect(Object.keys(resultat[0]).sort()).toEqual(
      ["nom", "tailleOctets", "typeMime"].sort(),
    );
  });
});
