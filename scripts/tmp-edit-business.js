const fs = require("fs");
const p = "lib/business.ts";
let s = fs.readFileSync(p, "utf8");

s = s.replace("where: { userId },", "where: { userId, status: \"active\" },");

s = s.replace(
  "    const member = await prisma.businessMember.create({\n      data: { userId, businessId: ownedBusiness.id, role: \"owner\" },\n    });",
  "    const member = await prisma.businessMember.upsert({\n      where: { businessId_userId: { businessId: ownedBusiness.id, userId } },\n      create: { userId, businessId: ownedBusiness.id, role: \"owner\", status: \"active\", joinedAt: new Date() },\n      update: { role: \"owner\", status: \"active\", joinedAt: new Date() },\n    });"
);

s = s.replace(
  "      members: { create: [{ userId, role: \"owner\" }] },",
  "      members: { create: [{ userId, role: \"owner\", status: \"active\", joinedAt: new Date() }] },"
);

fs.writeFileSync(p, s);
console.log("business helper updated");
