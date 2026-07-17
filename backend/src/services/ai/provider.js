export const unavailableAiProvider = Object.freeze({
  configured: false,
  async generateStructured() {
    throw new Error("The unavailable AI provider must not be invoked.");
  },
});

export const isLiveAiProvider = (provider) =>
  provider?.configured === true && typeof provider.generateStructured === "function";
