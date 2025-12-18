#!/usr/bin/env node
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.join(process.cwd(), "backups");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
const outfile = path.join(outDir, `backup-${stamp}.sql`);

try {
  execSync(`pg_dump "${url}" > "${outfile}"`, { stdio: "inherit", shell: true });
  console.log(`Backup written to ${outfile}`);
} catch (err) {
  console.error("Backup failed", err);
  process.exit(1);
}
