import { createApp } from "./app.js";
import { initDb } from "./storage/db.js";
import { startSelfPing, stopSelfPing } from "./selfPing.js";
import { closeLogger, initLogger, logError, logInfo } from "./utils/logger.js";

await initLogger();
logInfo("bootstrap: main.js loaded");
logInfo("bootstrap: env loaded", { port: process.env.PORT || "8000" });

const app = createApp();
const port = Number.parseInt(process.env.PORT || "8000", 10);

process.on("uncaughtException", (error) => {
  logError("uncaughtException", error);
});

process.on("unhandledRejection", (reason) => {
  logError("unhandledRejection", reason);
});

logInfo("bootstrap: initDb begin");
await initDb();
logInfo("bootstrap: initDb success");

startSelfPing();
logInfo("bootstrap: self ping configured");

const server = app.listen(port, "127.0.0.1", () => {
  logInfo("bootstrap: listening", { port });
  console.log(`Moldova Stores Product API Node listening on http://127.0.0.1:${port}`);
});

server.on("error", (error) => {
  logError("server error", error);
});

function shutdown() {
  logInfo("bootstrap: shutdown requested");
  stopSelfPing();
  server.close(async () => {
    logInfo("bootstrap: shutdown complete");
    await closeLogger();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
