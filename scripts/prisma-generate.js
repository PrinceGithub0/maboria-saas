const { spawnSync } = require("child_process");

function runPrismaGenerate() {
  if (!process.env.DATABASE_URL) {
    console.warn(
      "[prisma-generate] Skipping `prisma generate` because DATABASE_URL is not set."
    );
    return 0;
  }

  const env = { ...process.env };

  // Force a normal engine-backed Prisma Client for local Postgres usage.
  delete env.PRISMA_GENERATE_NO_ENGINE;

  const result = spawnSync("npx", ["prisma", "generate"], {
    shell: true,
    env,
    encoding: "utf8",
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status === 0) return 0;

  const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (combined.includes("EPERM") || combined.includes("operation not permitted, unlink")) {
    console.warn(
      "[prisma-generate] `prisma generate` failed with EPERM. Stop running Node/Next processes and rerun the command."
    );
    return 1;
  }

  return result.status ?? 1;
}

process.exit(runPrismaGenerate());
