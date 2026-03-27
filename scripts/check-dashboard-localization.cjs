#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = process.cwd();
const i18nPath = path.join(repoRoot, "lib", "i18n.ts");
const updateBaseline = process.argv.includes("--update");
const strictMode = process.argv.includes("--strict");
const scopeArg = process.argv.find((arg) => arg.startsWith("--scope="));
const scope = scopeArg ? scopeArg.slice("--scope=".length) : "dashboard";
const languageKeys = new Set(["en", "fr", "de", "es", "pt"]);
const requiredLanguageKeys = ["en", "fr", "de", "es", "pt"];
const translatableAttributeNames = new Set(["aria-label", "placeholder", "title", "alt"]);
const translatablePropertyNames = new Set(["label", "title", "description", "placeholder", "summary", "helperText"]);
const ignoredExactTexts = new Set([
  "Maboria",
  "MABORIA",
  "Maboria Inc.",
  "Flutterwave",
  "Paystack",
  "LinkedIn",
]);
const scopes = {
  dashboard: {
    label: "dashboard/admin",
    baselinePath: path.join(repoRoot, "scripts", "dashboard-localization-baseline.json"),
    targetRoots: [
      path.join(repoRoot, "app", "dashboard"),
      path.join(repoRoot, "app", "admin"),
      path.join(repoRoot, "components", "dashboard"),
      path.join(repoRoot, "components", "admin"),
      path.join(repoRoot, "lib", "admin"),
    ],
  },
  public: {
    label: "public/shared",
    baselinePath: path.join(repoRoot, "scripts", "public-localization-baseline.json"),
    targetRoots: [
      path.join(repoRoot, "app", "(marketing)"),
      path.join(repoRoot, "app", "(public)"),
      path.join(repoRoot, "app", "about"),
      path.join(repoRoot, "app", "contact"),
      path.join(repoRoot, "app", "create-account"),
      path.join(repoRoot, "app", "docs"),
      path.join(repoRoot, "app", "faq"),
      path.join(repoRoot, "app", "features"),
      path.join(repoRoot, "app", "forgot"),
      path.join(repoRoot, "app", "forgot-password"),
      path.join(repoRoot, "app", "login"),
      path.join(repoRoot, "app", "onboarding"),
      path.join(repoRoot, "app", "pricing"),
      path.join(repoRoot, "app", "privacy"),
      path.join(repoRoot, "app", "reset"),
      path.join(repoRoot, "app", "reset-password"),
      path.join(repoRoot, "app", "signup"),
      path.join(repoRoot, "app", "start-workspace"),
      path.join(repoRoot, "app", "status"),
      path.join(repoRoot, "app", "support"),
      path.join(repoRoot, "app", "terms"),
      path.join(repoRoot, "components", "faq"),
      path.join(repoRoot, "components", "pricing"),
      path.join(repoRoot, "components", "ui"),
    ],
  },
};
const scopeConfig = scopes[scope];

if (!scopeConfig) {
  console.error(`Unknown localization scope "${scope}". Expected one of: ${Object.keys(scopes).join(", ")}`);
  process.exit(1);
}

const baselinePath = scopeConfig.baselinePath;
const targetRoots = scopeConfig.targetRoots;
const scopeLabel = scopeConfig.label;

function loadFallbackCoverage() {
  if (!fs.existsSync(i18nPath)) return new Map();
  const text = fs.readFileSync(i18nPath, "utf8");
  const sourceFile = ts.createSourceFile(i18nPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const coverage = new Map();

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "FALLBACK_TRANSLATIONS" &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const prop of node.initializer.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = String(getPropertyName(prop) || "").trim();
        if (!key || !ts.isObjectLiteralExpression(prop.initializer)) continue;
        const languages = new Set(
          prop.initializer.properties
            .filter(ts.isPropertyAssignment)
            .map(getPropertyName)
            .filter((value) => value && languageKeys.has(value))
        );
        coverage.set(key, languages);
      }
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return coverage;
}

const fallbackCoverage = loadFallbackCoverage();

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    files.push(fullPath);
  }
  return files;
}

function getPropertyName(node) {
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) {
    return node.name.text;
  }
  return null;
}

function isStringLike(node) {
  return ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function getStringLikeText(node) {
  return isStringLike(node) ? node.text : "";
}

function normalizeLiteralText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function snippetText(value, limit = 80) {
  const normalized = normalizeLiteralText(value);
  return normalized.length > limit ? `${normalized.slice(0, limit - 3)}...` : normalized;
}

function isIgnorableLiteralText(value) {
  const normalized = normalizeLiteralText(value);
  if (!normalized) return true;
  if (ignoredExactTexts.has(normalized)) return true;
  if (!/[A-Za-z]/.test(normalized)) return true;
  if (/[@]/.test(normalized)) return true;
  if (/^(https?:|mailto:|www\.)/i.test(normalized)) return true;
  if (/^&[a-z]+;$/i.test(normalized)) return true;
  if (/^[#./0-9:%+\\\-() ]+$/.test(normalized)) return true;
  if (/^[A-Z]{1,4}$/.test(normalized)) return true;
  if (/^(x|i)$/i.test(normalized)) return true;
  if (/(^|\s)(dark:|hover:|focus:|md:|lg:|xl:|text-|bg-|border-|from-|to-|via-|ring-|px-|py-|mx-|my-|w-|h-)/.test(normalized)) {
    return true;
  }
  return false;
}

function getJsxAttributeText(attribute) {
  if (!attribute.initializer) return "";
  if (ts.isStringLiteral(attribute.initializer)) {
    return attribute.initializer.text;
  }
  if (
    ts.isJsxExpression(attribute.initializer) &&
    attribute.initializer.expression &&
    isStringLike(attribute.initializer.expression)
  ) {
    return attribute.initializer.expression.text;
  }
  return "";
}

function getIssueKey(issue) {
  return `${issue.kind}|${issue.file}|${issue.line}|${issue.column}|${issue.detail}`;
}

function createIssue(sourceFile, node, kind, detail) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    kind,
    file: path.relative(repoRoot, sourceFile.fileName).replace(/\\/g, "/"),
    line: line + 1,
    column: character + 1,
    detail,
  };
}

function hasRequiredJsxAttribute(attributes, name) {
  return attributes.properties.some(
    (prop) => ts.isJsxAttribute(prop) && prop.name.text === name
  );
}

function getMissingLanguageKeys(keys) {
  return requiredLanguageKeys.filter((key) => !keys.has(key));
}

function isCoveredByFallbackTranslation(enText, missingKeys) {
  if (!enText || missingKeys.length === 0) return false;
  const coverage = fallbackCoverage.get(String(enText).trim());
  return Boolean(coverage && missingKeys.every((key) => coverage.has(key)));
}

function isInsideLocalizedLanguageMap(node) {
  const parent = node.parent;
  const grandParent = parent?.parent;
  if (
    grandParent &&
    ts.isPropertyAssignment(grandParent) &&
    languageKeys.has(getPropertyName(grandParent) || "")
  ) {
    return true;
  }
  return false;
}

function collectIssuesForFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, scriptKind);
  const issues = [];

  function visit(node) {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === "t") {
        const args = node.arguments;
        if (
          args.length >= 2 &&
          args.length < 5 &&
          isStringLike(args[0]) &&
          args.slice(1).every(isStringLike)
        ) {
          const providedKeys = new Set(requiredLanguageKeys.slice(0, args.length));
          const missing = getMissingLanguageKeys(providedKeys);
          const enText = args[0].text;
          if (!isCoveredByFallbackTranslation(enText, missing)) {
            issues.push(
              createIssue(
                sourceFile,
                node,
                "partial-t-call",
                `t() call provides ${args.length} languages instead of all 5`
              )
            );
          }
        }
        if (args.length > 0 && ts.isObjectLiteralExpression(args[0])) {
          const keys = new Set(
            args[0].properties
              .filter(ts.isPropertyAssignment)
              .map(getPropertyName)
              .filter((value) => value && languageKeys.has(value))
          );
          if (keys.size >= 2) {
            const missing = getMissingLanguageKeys(keys);
            const enProperty = args[0].properties.find(
              (prop) => ts.isPropertyAssignment(prop) && getPropertyName(prop) === "en"
            );
            const enText =
              enProperty &&
              ts.isPropertyAssignment(enProperty) &&
              isStringLike(enProperty.initializer)
                ? enProperty.initializer.text
                : "";
            if (missing.length > 0 && !isCoveredByFallbackTranslation(enText, missing)) {
              issues.push(
                createIssue(
                  sourceFile,
                  args[0],
                  "partial-translation-object",
                  `translation object passed to t() is missing: ${missing.join(", ")}`
                )
              );
            }
          }
        }
      }

      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === "getLocalizedText" &&
        node.arguments.length > 0 &&
        ts.isObjectLiteralExpression(node.arguments[0])
      ) {
        const keys = new Set(
          node.arguments[0].properties
            .filter(ts.isPropertyAssignment)
            .map(getPropertyName)
            .filter((value) => value && languageKeys.has(value))
        );
        if (keys.size >= 2) {
          const missing = getMissingLanguageKeys(keys);
          const enProperty = node.arguments[0].properties.find(
            (prop) => ts.isPropertyAssignment(prop) && getPropertyName(prop) === "en"
          );
          const enText =
            enProperty &&
            ts.isPropertyAssignment(enProperty) &&
            isStringLike(enProperty.initializer)
              ? enProperty.initializer.text
              : "";
          if (missing.length > 0 && !isCoveredByFallbackTranslation(enText, missing)) {
            issues.push(
              createIssue(
                sourceFile,
                node.arguments[0],
                "partial-translation-object",
                `translation object passed to getLocalizedText() is missing: ${missing.join(", ")}`
              )
            );
          }
        }
      }
    }

    if (ts.isObjectLiteralExpression(node)) {
      const parent = node.parent;
      const keys = new Set(
        node.properties
          .filter(ts.isPropertyAssignment)
          .map(getPropertyName)
          .filter((value) => value && languageKeys.has(value))
      );
      const shouldIgnoreParent =
        ts.isCallExpression(parent) ||
        ts.isJsxExpression(parent) ||
        ts.isReturnStatement(parent);
      if (!shouldIgnoreParent && keys.size >= 2) {
        const missing = getMissingLanguageKeys(keys);
        const enProperty = node.properties.find(
          (prop) => ts.isPropertyAssignment(prop) && getPropertyName(prop) === "en"
        );
        const enText =
          enProperty &&
          ts.isPropertyAssignment(enProperty) &&
          isStringLike(enProperty.initializer)
            ? enProperty.initializer.text
            : "";
        if (missing.length > 0 && !isCoveredByFallbackTranslation(enText, missing)) {
          issues.push(
            createIssue(
              sourceFile,
              node,
              "partial-translation-object",
              `translation object is missing: ${missing.join(", ")}`
            )
          );
        }
      }
    }

    if (
      ts.isPropertyAssignment(node) &&
      translatablePropertyNames.has(getPropertyName(node) || "") &&
      isStringLike(node.initializer)
    ) {
      const parent = node.parent;
      const siblingKeys = new Set(
        ts.isObjectLiteralExpression(parent)
          ? parent.properties
              .filter(ts.isPropertyAssignment)
              .map(getPropertyName)
              .filter((value) => value && languageKeys.has(value))
          : []
      );
      const value = getStringLikeText(node.initializer);
      if (siblingKeys.size === 0 && !isInsideLocalizedLanguageMap(node) && !isIgnorableLiteralText(value)) {
        issues.push(
          createIssue(
            sourceFile,
            node,
            "raw-ui-string-property",
            `${getPropertyName(node)} property uses raw UI text: "${snippetText(value)}"`
          )
        );
      }
    }

    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && ts.isIdentifier(node.tagName) && node.tagName.text === "LangText") {
      if (hasRequiredJsxAttribute(node.attributes, "en")) {
        const providedKeys = new Set(
          requiredLanguageKeys.filter((key) => hasRequiredJsxAttribute(node.attributes, key))
        );
        const missing = getMissingLanguageKeys(providedKeys);
        const enAttribute = node.attributes.properties.find(
          (prop) => ts.isJsxAttribute(prop) && prop.name.text === "en"
        );
        const enText =
          enAttribute &&
          ts.isJsxAttribute(enAttribute) &&
          enAttribute.initializer &&
          ts.isStringLiteral(enAttribute.initializer)
            ? enAttribute.initializer.text
            : "";
        if (missing.length > 0 && !isCoveredByFallbackTranslation(enText, missing)) {
          issues.push(
            createIssue(
              sourceFile,
              node,
              "partial-langtext",
              `LangText is missing props: ${missing.join(", ")}`
            )
          );
        }
      }
    }

    if (ts.isJsxAttribute(node) && translatableAttributeNames.has(node.name.text)) {
      const value = getJsxAttributeText(node);
      if (value && !isIgnorableLiteralText(value)) {
        issues.push(
          createIssue(
            sourceFile,
            node,
            "raw-jsx-attribute",
            `${node.name.text} uses raw UI text: "${snippetText(value)}"`
          )
        );
      }
    }

    if (ts.isJsxText(node)) {
      const value = normalizeLiteralText(node.getText(sourceFile));
      if (!isIgnorableLiteralText(value)) {
        issues.push(
          createIssue(
            sourceFile,
            node,
            "raw-jsx-text",
            `raw JSX text should be localized: "${snippetText(value)}"`
          )
        );
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return issues;
}

const currentIssues = targetRoots
  .flatMap((root) => walk(root))
  .flatMap((file) => collectIssuesForFile(file))
  .sort((a, b) => getIssueKey(a).localeCompare(getIssueKey(b)));

if (updateBaseline) {
  fs.writeFileSync(baselinePath, `${JSON.stringify(currentIssues, null, 2)}\n`);
  console.log(`Updated ${scopeLabel} localization baseline with ${currentIssues.length} issue(s).`);
  process.exit(0);
}

if (!fs.existsSync(baselinePath)) {
  console.error(`Missing ${scopeLabel} localization baseline. Run: node scripts/check-dashboard-localization.cjs --scope=${scope} --update`);
  process.exit(1);
}

const baselineIssues = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const baselineKeys = new Set(baselineIssues.map(getIssueKey));
const currentKeys = new Set(currentIssues.map(getIssueKey));
const newIssues = currentIssues.filter((issue) => !baselineKeys.has(getIssueKey(issue)));
const resolvedIssues = baselineIssues.filter((issue) => !currentKeys.has(getIssueKey(issue)));

if (strictMode) {
  if (currentIssues.length > 0) {
    console.error(`Current ${scopeLabel} localization audit found ${currentIssues.length} issue(s):`);
    for (const issue of currentIssues) {
      console.error(`- ${issue.file}:${issue.line}:${issue.column} [${issue.kind}] ${issue.detail}`);
    }
    process.exit(1);
  }
  console.log(`No ${scopeLabel} localization issues detected in strict audit mode.`);
  process.exit(0);
}

if (newIssues.length > 0) {
  console.error(`New ${scopeLabel} localization issues detected:`);
  for (const issue of newIssues) {
    console.error(`- ${issue.file}:${issue.line}:${issue.column} [${issue.kind}] ${issue.detail}`);
  }
  if (resolvedIssues.length > 0) {
    console.error("");
    console.error("Resolved baseline issues were also detected. Refresh the baseline after reviewing:");
    for (const issue of resolvedIssues.slice(0, 10)) {
      console.error(`- ${issue.file}:${issue.line}:${issue.column} [${issue.kind}] ${issue.detail}`);
    }
    if (resolvedIssues.length > 10) {
      console.error(`- ...and ${resolvedIssues.length - 10} more`);
    }
  }
  process.exit(1);
}

if (resolvedIssues.length > 0) {
  console.log(`No new issues. ${resolvedIssues.length} baseline issue(s) were resolved; run with --update to refresh the baseline.`);
} else {
  console.log(`No new ${scopeLabel} localization issues detected.`);
}
