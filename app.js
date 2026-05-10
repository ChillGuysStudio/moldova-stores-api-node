import { loadEnvFile } from "./src/env.js";

loadEnvFile();

await import("./src/main.js");
