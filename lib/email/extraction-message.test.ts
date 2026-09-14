import { describe, expect, it } from "vitest";
import { extraireCorpsTexte } from "./extraction-message";

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
});
