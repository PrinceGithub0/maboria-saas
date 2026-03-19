const fs = require("fs");
const p = "app/api/auth/register/route.ts";
let s = fs.readFileSync(p, "utf8");

const from = `    where: {
      email: normalizedEmail,
      status: "PENDING",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      ...(inviteToken
        ? {
            OR: [
              { tokenHash: inviteTokenHash ?? undefined },
              { token: inviteTokenHash ?? undefined },
              { token: inviteToken },
            ],
          }
        : {}),
    },`;

const to = `    where: {
      email: normalizedEmail,
      status: "PENDING",
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ...(inviteToken
          ? [
              {
                OR: [
                  { tokenHash: inviteTokenHash ?? undefined },
                  { token: inviteTokenHash ?? undefined },
                  { token: inviteToken },
                ],
              },
            ]
          : []),
      ],
    },`;

if (!s.includes(from)) {
  throw new Error("pattern not found");
}

s = s.replace(from, to);
fs.writeFileSync(p, s);
console.log("fixed register where clause");
