import { app } from "./app.js";
import { env } from "./config/env.js";
import { assertSupabaseConfiguration } from "./config/supabase.js";

assertSupabaseConfiguration();

const server = app.listen(env.PORT, () => {
  console.log(`Ascent API listening on port ${env.PORT}`);
});

const shutdown = (signal) => {
  console.log(`${signal} received. Closing HTTP server.`);
  server.close(() => process.exit(0));
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
