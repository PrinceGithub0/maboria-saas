#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = process.cwd();
const messagesDir = path.join(repoRoot, "messages");
const strictMode = process.argv.includes("--strict");
const locales = ["en", "fr", "de", "es", "pt"];
const suspiciousMojibakeRe = /(?:Ã.|Â.|ï¿½)/;
const suspiciousQuestionMarkRe = /[A-Za-zÀ-ÿ]\?[A-Za-zÀ-ÿ]/;

function readCatalog(locale) {
  const filePath = path.join(messagesDir, `${locale}.json`);
  const raw = fs.readFileSync(filePath, "utf8");
  return {
    filePath,
    data: JSON.parse(raw),
  };
}

const catalogs = Object.fromEntries(locales.map((locale) => [locale, readCatalog(locale)]));
const referenceKeys = Object.keys(catalogs.en.data).sort();
const issues = [];

for (const locale of locales) {
  const { filePath, data } = catalogs[locale];
  const keys = Object.keys(data).sort();
  const missing = referenceKeys.filter((key) => !(key in data));
  const extra = keys.filter((key) => !referenceKeys.includes(key));

  for (const key of missing) {
    issues.push(`${path.relative(repoRoot, filePath)} missing key "${key}"`);
  }

  for (const key of extra) {
    issues.push(`${path.relative(repoRoot, filePath)} has extra key "${key}"`);
  }

  for (const key of keys) {
    const value = data[key];
    if (typeof value !== "string") {
      issues.push(`${path.relative(repoRoot, filePath)} key "${key}" must be a string`);
      continue;
    }
    if (suspiciousMojibakeRe.test(value)) {
      issues.push(`${path.relative(repoRoot, filePath)} key "${key}" contains suspicious mojibake`);
    }
    if (suspiciousQuestionMarkRe.test(value)) {
      issues.push(`${path.relative(repoRoot, filePath)} key "${key}" contains a suspicious question-mark replacement`);
    }
  }
}

if (issues.length > 0) {
  console.error("Message catalog validation failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

if (strictMode) {
  console.log("Message catalogs passed strict validation.");
} else {
  console.log("Message catalogs are valid.");
}
