import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const LOG_DIR = path.join(ROOT_DIR, "logs");
let logStream = null;
let logDirReady = false;
let streamFailed = false;
let activeLogDate = null;

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

function logDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function logFilePathForDate(dateKey) {
  return path.join(LOG_DIR, `app-${dateKey}.log`);
}

function bindStreamError(stream) {
  stream.on("error", (error) => {
    streamFailed = true;
    if (logStream === stream) {
      logStream = null;
      activeLogDate = null;
    }
    console.error(`[logger] stream error: ${normalizePart(error)}`);
  });
  return stream;
}

function openLogStream(dateKey = logDateKey()) {
  try {
    const nextStream = bindStreamError(
      fs.createWriteStream(logFilePathForDate(dateKey), {
        flags: "a",
        encoding: "utf8"
      })
    );
    const previousStream = logStream;
    logStream = nextStream;
    activeLogDate = dateKey;
    if (previousStream) {
      previousStream.end();
    }
    return logStream;
  } catch (error) {
    streamFailed = true;
    console.error(`[logger] initialization error: ${normalizePart(error)}`);
    return null;
  }
}

export async function initLogger() {
  if (logDirReady || streamFailed) {
    return;
  }

  try {
    await fs.promises.mkdir(LOG_DIR, { recursive: true });
    logDirReady = true;
    openLogStream();
  } catch (error) {
    streamFailed = true;
    console.error(`[logger] initialization error: ${normalizePart(error)}`);
  }
}

function ensureLogStream() {
  if (streamFailed || !logDirReady) {
    return logStream;
  }
  const dateKey = logDateKey();
  if (!logStream || activeLogDate !== dateKey) {
    return openLogStream(dateKey);
  }
  return logStream;
}

function writeLine(level, parts) {
  const line = `[${timestamp()}] [${level}] ${parts.map(normalizePart).join(" ")}\n`;
  const stream = ensureLogStream();
  if (stream) {
    stream.write(line);
    return;
  }
  console.error(line.trimEnd());
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

export function closeLogger() {
  if (!logStream) {
    return Promise.resolve();
  }

  const stream = logStream;
  logStream = null;
  activeLogDate = null;
  return new Promise((resolve) => {
    stream.end(resolve);
  });
}
