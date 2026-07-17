import { describe, expect, it } from "vitest";

import defaultApp, { app, createApp } from "../src/app.js";

describe("deployment entry compatibility", () => {
  it("default-exports the same Express application used by local tests", () => {
    expect(defaultApp).toBe(app);
    expect(typeof defaultApp).toBe("function");
    expect(defaultApp.listen).toBeTypeOf("function");
  });

  it("keeps application construction separate from starting a listener", () => {
    const isolatedApp = createApp();
    expect(isolatedApp.listening).toBeUndefined();
  });
});
