const fs = require("fs");
const p = "lib/automation/permissions.ts";
let s = fs.readFileSync(p, "utf8");

s = s.replace("  agent: 10,", "  member: 10,\n  agent: 10,");
s = s.replace(
`  return {
    role: role || "agent",`,
`  return {
    role: role || "member",`
);
s = s.replace("    where: { userId },", "    where: { userId, status: \"active\" },");
s = s.replace(
  "  return resolvePermissionsByRole(primaryRole || \"agent\", \"business_member\");",
  "  return resolvePermissionsByRole(primaryRole || \"member\", \"business_member\");"
);

fs.writeFileSync(p, s);
console.log("automation permissions updated");
