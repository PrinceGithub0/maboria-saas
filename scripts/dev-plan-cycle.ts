import { prisma } from "../lib/prisma";
import { getUserPlan } from "../lib/entitlements";
import { addDays } from "date-fns";

async function run() {
  if (process.env.NODE_ENV !== "development" || process.env.DEV_PLAN_SIMULATION !== "true") {
    console.error("DEV_PLAN_SIMULATION must be true and NODE_ENV must be development.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const emailArg = args.find((arg) => arg.startsWith("--email="));
  const userIdArg = args.find((arg) => arg.startsWith("--userId="));
  const email = emailArg ? emailArg.split("=")[1] : null;
  const userId = userIdArg ? userIdArg.split("=")[1] : null;

  const user = email
    ? await prisma.user.findUnique({ where: { email } })
    : userId
      ? await prisma.user.findUnique({ where: { id: userId } })
      : null;

  if (!user) {
    console.error("Provide --email=<user@email> or --userId=<id>");
    process.exit(1);
  }

  const logPlan = async (label: string) => {
    const plan = await getUserPlan(user.id);
    console.log(`${label}: ${plan}`);
  };

  console.log(`Simulating plan cycle for ${user.email} (${user.id})`);

  await prisma.subscription.updateMany({
    where: { userId: user.id },
    data: { status: "CANCELED" },
  });
  await logPlan("After cancel (free)");

  const renewalDate = addDays(new Date(), 30);
  const starter = await prisma.subscription.create({
    data: {
      userId: user.id,
      plan: "STARTER",
      status: "ACTIVE",
      renewalDate,
      currency: "NGN",
      interval: "monthly",
    },
  });
  await logPlan("After starter");

  await prisma.subscription.update({
    where: { id: starter.id },
    data: { plan: "GROWTH", status: "ACTIVE", renewalDate },
  });
  await logPlan("After pro");

  await prisma.subscription.update({
    where: { id: starter.id },
    data: { status: "CANCELED" },
  });
  await logPlan("After cancel (free)");

  await prisma.$disconnect();
}

run().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
