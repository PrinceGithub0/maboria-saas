const fs = require("fs");

const files = [
  "app/api/whatsapp/agents/route.ts",
  "app/api/business/route.ts",
];

for (const p of files) {
  let s = fs.readFileSync(p, "utf8");
  s = s.replace("where: { businessId },", "where: { businessId, status: \"active\" },");
  s = s.replace("where: { userId: session.user.id },", "where: { userId: session.user.id, status: \"active\" },");
  fs.writeFileSync(p, s);
  console.log(`updated ${p}`);
}
