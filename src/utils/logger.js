import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const LOG_DIR = path.join(ROOT_DIR, "logs");
const DEFAULT_LOG_FILE = path.join(LOG_DIR, "app.log");

function timestamp() {
  return new Date().toISOString();
}

function normalizePart(value) {
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function writeLine(level, parts) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const line = `[${timestamp()}] [${level}] ${parts.map(normalizePart).join(" ")}\n`;
  fs.appendFileSync(DEFAULT_LOG_FILE, line, "utf8");
}

export function logInfo(...parts) {
  writeLine("INFO", parts);
}

export function logWarn(...parts) {
  writeLine("WARN", parts);
}

export function logError(...parts) {
  writeLine("ERROR", parts);
}
