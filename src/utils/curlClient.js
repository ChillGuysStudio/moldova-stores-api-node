import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_HEADERS = [
  "accept-language: ro-RO,ro;q=0.9,en-US;q=0.7,en;q=0.6",
  "user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
];

let resolvedBinary = null;

function bundledCandidates() {
  const platform = process.platform;
  const arch = process.arch;
  const root = path.resolve(__dirname, "..", "..");
  const names = platform === "win32"
    ? [
        "curl_chrome116.exe",
        "curl_chrome110.exe",
        "curl_chrome107.exe",
        "curl_chrome.exe",
        "curl-impersonate-chrome.exe"
      ]
    : [
        "curl_chrome116",
        "curl_chrome110",
        "curl_chrome107",
        "curl_chrome",
        "curl-impersonate-chrome"
      ];

  const directories = [
    path.join(root, "bin"),
    path.join(root, "bin", `${platform}-${arch}`),
    path.join(root, "bin", platform),
    path.join(root, "bin", arch)
  ];

  const candidates = [];
  for (const directory of directories) {
    for (const name of names) {
      candidates.push(path.join(directory, name));
    }
  }
  return candidates;
}

function impersonateCandidates() {
  return [
    process.env.CURL_IMPERSONATE_BIN,
    ...bundledCandidates(),
    "curl_chrome116",
    "curl_chrome110",
    "curl_chrome107",
    "curl-impersonate-chrome",
    "curl_chrome",
    "curl-impersonate",
    "curl"
  ].filter(Boolean);
}

async function resolveBinary() {
  if (resolvedBinary) {
    return resolvedBinary;
  }
  for (const candidate of impersonateCandidates()) {
    try {
      if (candidate.includes(path.sep) && !fs.existsSync(candidate)) {
        continue;
      }
      await execFileAsync(candidate, ["--version"], { maxBuffer: 1024 * 1024 });
      resolvedBinary = candidate;
      return resolvedBinary;
    } catch {
      continue;
    }
  }
  throw new Error(
    "No curl-compatible binary found. Bundle curl-impersonate in bin/<platform>-<arch>/ or set CURL_IMPERSONATE_BIN."
  );
}

async function runCurl(args, { requireImpersonation = false } = {}) {
  const binary = await resolveBinary();
  if (requireImpersonation && binary === "curl") {
    throw new Error(
      "curl-impersonate is required for this request, but only plain curl is available. Set CURL_IMPERSONATE_BIN."
    );
  }
  const { stdout } = await execFileAsync(binary, args, {
    maxBuffer: 10 * 1024 * 1024
  });
  return stdout;
}

export async function getText(url, headers = {}, options = {}) {
  const args = ["-sSL", "--fail", url];
  for (const header of DEFAULT_HEADERS) {
    args.push("-H", header);
  }
  for (const [key, value] of Object.entries(headers)) {
    args.push("-H", `${key}: ${value}`);
  }
  return runCurl(args, options);
}

export async function postJson(url, payload, headers = {}, options = {}) {
  const args = ["-sSL", "--fail", url, "-X", "POST", "-H", "accept: application/json", "-H", "content-type: application/json", "--data", JSON.stringify(payload)];
  for (const header of DEFAULT_HEADERS) {
    args.push("-H", header);
  }
  for (const [key, value] of Object.entries(headers)) {
    args.push("-H", `${key}: ${value}`);
  }
  const stdout = await runCurl(args, options);
  return JSON.parse(stdout);
}
