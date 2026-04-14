import { loadEnvFile } from "./env.js";
import { createApp } from "./app.js";
import { initDb } from "./storage/db.js";
import { startSelfPing, stopSelfPing } from "./selfPing.js";

loadEnvFile();

const app = createApp();
const port = Number.parseInt(process.env.PORT || "8000", 10);

await initDb();
startSelfPing();

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Moldova Stores Product API Node listening on http://0.0.0.0:${port}`);
});

function shutdown() {
  stopSelfPing();
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
