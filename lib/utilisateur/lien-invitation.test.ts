import { describe, expect, it, afterEach } from "vitest";
import { construireLienInvitation } from "./lien-invitation";

describe("construireLienInvitation", () => {
  const urlOriginale = process.env.APP_URL;

  afterEach(() => {
    if (urlOriginale === undefined) {
      delete process.env.APP_URL;
    } else {
      process.env.APP_URL = urlOriginale;
    }
  });

  it("utilise APP_URL quand défini", () => {
    process.env.APP_URL = "https://ao-pilot-nine.vercel.app";
    expect(construireLienInvitation("abc123")).toBe(
      "https://ao-pilot-nine.vercel.app/invitation/abc123",
    );
  });

  it("retombe sur localhost:3000 quand APP_URL est absent", () => {
    delete process.env.APP_URL;
    expect(construireLienInvitation("abc123")).toBe(
      "http://localhost:3000/invitation/abc123",
    );
  });
});
