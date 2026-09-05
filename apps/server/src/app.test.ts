import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("app", () => {
  const app = createApp();

  it("reports health including database connectivity", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: "up" });
  });

  it("returns JSON 404 for unknown API routes even with a built SPA present", async () => {
    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("serves the SPA at / and for deep links", async () => {
    for (const p of ["/", "/some/client/route"]) {
      const res = await app.request(p);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("fixture-spa");
    }
  });
});
