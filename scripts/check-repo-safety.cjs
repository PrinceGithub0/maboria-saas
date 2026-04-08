#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const repoRoot = process.cwd();
const ignoredExactFiles = new Set([
  ".env.example",
  ".env.production.example",
]);

const forbiddenPathChecks = [
  {
    label: "tracked env file",
    test: (file) =>
      /^\.env($|\.)/.test(path.basename(file)) && !ignoredExactFiles.has(file),
  },
  {
    label: "tracked log file",
    test: (file) => /\.log$/i.test(file),
  },
  {
    label: "generated receipts directory",
    test: (file) => file.startsWith("public/receipts/"),
  },
  {
    label: "private key / certificate file",
    test: (file) => /\.(pem|key|p12|pfx)$/i.test(file),
  },
];

const secretPatterns = [
  { label: "GitHub personal access token", regex: /\bghp_[A-Za-z0-9]{20,}\b/g },
  { label: "GitHub fine-grained token", regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { label: "OpenAI-style secret key", regex: /\bsk_(live|test)_[A-Za-z0-9]{16,}\b/g },
  { label: "Publishable key", regex: /\bpk_(live|test)_[A-Za-z0-9]{16,}\b/g },
  { label: "Google API key", regex: /\bAIza[0-9A-Za-z\-_]{20,}\b/g },
  { label: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    label: "Private key block",
    regex:
      /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]{20,}-----END (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
  },
];

function getTrackedFiles() {
  try {
    const output = execFileSync("git", ["ls-files", "-z"], {
      cwd: repoRoot,
      encoding: "buffer",
    });
    return output
      .toString("utf8")
      .split("\0")
      .map((file) => file.trim())
      .filter(Boolean);
  } catch {
    return walkRepo(repoRoot);
  }
}

function walkRepo(root) {
  const ignoredDirs = new Set([
    ".git",
    "node_modules",
    ".next",
    ".next-dev",
    "coverage",
    "build",
    "out",
    "uploads",
  ]);
  const ignoredExactFiles = new Set([
    ".next-dev.log",
    ".next-dev.err.log",
    "dev-restart.log",
    "build-output.log",
  ]);
  const results = [];

  function visit(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (ignoredDirs.has(entry.name)) continue;
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = path.relative(root, absolutePath).replace(/\\/g, "/");
      const baseName = path.basename(relativePath);
      if (ignoredExactFiles.has(relativePath) || ignoredExactFiles.has(baseName)) continue;
      if (/^\.env($|\.)/.test(baseName) && !ignoredExactFiles.has(relativePath) && !ignoredExactFiles.has(baseName)) {
        if (!ignoredExactFiles.has(relativePath) && !ignoredExactFiles.has(baseName) && ![".env.example", ".env.production.example"].includes(baseName)) {
          continue;
        }
      }
      if (relativePath.startsWith("public/receipts/")) continue;
      if (/\.log$/i.test(baseName)) continue;
      if (/\.(pem|key|p12|pfx)$/i.test(baseName)) continue;
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else {
        results.push(relativePath);
      }
    }
  }

  visit(root);
  return results;
}

function isTextFile(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  return !sample.includes(0);
}

function readFileIfText(absolutePath) {
  const buffer = fs.readFileSync(absolutePath);
  if (!isTextFile(buffer)) return null;
  return buffer.toString("utf8");
}

function main() {
  const files = getTrackedFiles();
  const issues = [];

  for (const file of files) {
    for (const rule of forbiddenPathChecks) {
      if (rule.test(file)) {
        issues.push(`${file}: ${rule.label}`);
      }
    }

    const absolutePath = path.join(repoRoot, file);
    if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) continue;

    const text = readFileIfText(absolutePath);
    if (text === null) continue;

    for (const pattern of secretPatterns) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(text)) {
        issues.push(`${file}: possible ${pattern.label}`);
      }
    }
  }

  if (issues.length) {
    console.error(`Repo safety audit found ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log("Repo safety audit passed.");
}

main();
