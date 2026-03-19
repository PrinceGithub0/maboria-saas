const { PrismaClient } = require("@prisma/client");

const email = "collinserons126@gmail.com".toLowerCase();

(async () => {
  const p = new PrismaClient();
  const user = await p.user.findUnique({ where: { email } });
  if (!user) {
    console.log("NOT_FOUND");
    await p.$disconnect();
    return;
  }

  await p.user.update({ where: { email }, data: { role: "OPS_ADMIN" } });

  let sub = await p.subscription.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const start = new Date();
  const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  if (!sub) {
    await p.subscription.create({
      data: {
        userId: user.id,
        plan: "ENTERPRISE",
        status: "ACTIVE",
        interval: "monthly",
        autoRenew: true,
        provider: "PAYSTACK",
        currentPeriodStart: start,
        currentPeriodEnd: end,
        renewalDate: end,
        cancelAtPeriodEnd: false,
      },
    });
    console.log("CREATED_SUB");
  } else {
    await p.subscription.update({
      where: { id: sub.id },
      data: {
        plan: "ENTERPRISE",
        status: "ACTIVE",
        interval: sub.interval ?? "monthly",
        autoRenew: true,
        provider: sub.provider ?? "PAYSTACK",
        currentPeriodStart: sub.currentPeriodStart ?? start,
        currentPeriodEnd: sub.currentPeriodEnd ?? end,
        renewalDate: sub.renewalDate ?? (sub.currentPeriodEnd ?? end),
        cancelAtPeriodEnd: false,
      },
    });
    console.log("UPDATED_SUB");
  }

  console.log("OPS_ADMIN_ENTERPRISE_READY");
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
