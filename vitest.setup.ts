import { vi } from "vitest";

// Mock server-only for tests — in production this is handled by Next.js bundler
vi.mock("server-only", () => ({}));
