const { spawnSync } = require("child_process");
const { loadLocalEnv } = require("./load-local-env");

loadLocalEnv();

function main() {
  // Prisma generate requires DATABASE_URL to be present because schema.prisma reads env("DATABASE_URL").
  if (!process.env.DATABASE_URL) {
    console.warn(
      "[postinstall] Skipping `prisma generate` because DATABASE_URL is not set. Run `npm run db:generate` after configuring your environment."
    );
    return;
  }

  const env = { ...process.env };
  const command =
    process.platform === "win32"
      ? process.env.ComSpec || "cmd.exe"
      : "npx";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npx prisma generate"]
      : ["prisma", "generate"];

  // Prevent shell-level no-engine settings from generating an Accelerate-only client.
  delete env.PRISMA_GENERATE_NO_ENGINE;

  const result = spawnSync(command, args, {
    env,
    encoding: "utf8",
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status === 0) return;

  // Windows can fail with EPERM if a Node process is currently using the Prisma query engine.
  const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (combined.includes("EPERM") || combined.includes("operation not permitted, unlink")) {
    console.warn(
      "[postinstall] `prisma generate` failed with EPERM (likely due to a running Node process locking Prisma binaries). Stop running node/next processes and run `npm run db:generate`."
    );
    return;
  }

  process.exit(result.status ?? 1);
}

main();
