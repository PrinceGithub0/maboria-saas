const fs = require("fs");
const p = "lib/whatsapp.ts";
let s = fs.readFileSync(p, "utf8");

const from = `  const member = await prisma.businessMember.findFirst({
    where: { userId },
    select: { businessId: true },
  });`;

const to = `  const member = await prisma.businessMember.findFirst({
    where: { userId, status: "active" },
    select: { businessId: true },
  });`;

s = s.replace(from, to);
fs.writeFileSync(p, s);
console.log("updated whatsapp business member lookup");
