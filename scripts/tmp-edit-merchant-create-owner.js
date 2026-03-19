const fs = require("fs");
const p = "app/api/merchant-account/create/route.ts";
let s = fs.readFileSync(p, "utf8");

s = s.replaceAll('where: { userId: session.user.id }', 'where: { userId: access.ownerUserId }');
s = s.replaceAll('userId: session.user.id,', 'userId: access.ownerUserId,');

fs.writeFileSync(p, s);
console.log("merchant create route owner scope updated");
