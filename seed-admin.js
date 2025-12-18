const {PrismaClient} = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();
(async () => {
  const hash = await bcrypt.hash("password", 10);
  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { passwordHash: hash, role: "ADMIN" },
    create: {
      id: "seed-admin-1",
      name: "Admin",
      email: "admin@example.com",
      passwordHash: hash,
      role: "ADMIN",
      onboardingComplete: true,
      tourComplete: true,
      preferredCurrency: "USD",
    },
  });
  await prisma.$disconnect();
})();
