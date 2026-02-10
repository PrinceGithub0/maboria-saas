/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  const email = `starter-test-${Date.now()}@example.com`;
  const password = "TestPassword123!";
  const name = "Starter Test";

  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password, planIntent: "starter" }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Signup failed (${res.status}): ${text}`);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not created");

  const subscription = await prisma.subscription.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { plan: true, status: true },
  });
  const business = await prisma.business.findFirst({
    where: { ownerId: user.id },
    select: { plan: true },
  });

  console.log("Subscription plan:", subscription?.plan);
  console.log("Subscription status:", subscription?.status);
  console.log("Business plan:", business?.plan);

  if (subscription?.plan !== "STARTER") {
    throw new Error("Expected Subscription.plan = STARTER");
  }
  if (subscription?.status !== "INCOMPLETE") {
    throw new Error("Expected Subscription.status = INCOMPLETE");
  }
  if (business) {
    throw new Error("Expected no Business record before onboarding");
  }

  console.log("PASS: Starter signup persisted plan to Subscription (INCOMPLETE) with no Business yet.");
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
