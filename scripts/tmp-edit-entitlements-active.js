const fs = require("fs");
const p = "lib/entitlements.ts";
let s = fs.readFileSync(p, "utf8");

s = s.replace("where: { userId },", "where: { userId, status: \"active\" },");
s = s.replace("where: { businessId: business.id },", "where: { businessId: business.id, status: \"active\" },");

const target = `  const member = await prisma.businessMember.findFirst({
    where: { userId },`;
const replacement = `  const member = await prisma.businessMember.findFirst({
    where: { userId, status: "active" },`;
s = s.replace(target, replacement);

fs.writeFileSync(p, s);
console.log("entitlements business member filters updated");
