const fs = require("fs");
const p = "app/dashboard/team/page.tsx";
let s = fs.readFileSync(p, "utf8");

s = s.replace(
`  const inviteDisabled =
    planLabel === "starter" ||
    (typeof seatLimit === "number" && seatsUsed >= seatLimit) ||
    saving;`,
`  const canInvite = Boolean(data?.permissions?.canInvite);
  const canRemoveMember = Boolean(data?.permissions?.canRemoveMember);
  const inviteDisabled =
    !canInvite ||
    planLabel === "starter" ||
    (typeof seatLimit === "number" && seatsUsed >= seatLimit) ||
    saving;`
);

s = s.replace(
`          disabled={saving || member.role === "owner"}`,
`          disabled={saving || !canRemoveMember || member.role === "owner"}`
);

s = s.replace(
`      {data?.error && !status ? (`,
`      {!canInvite ? (
        <Alert variant="info">{t("Your access is read-only for team management.", "Votre acces est en lecture seule pour l equipe.")}</Alert>
      ) : null}

      {data?.error && !status ? (`
);

fs.writeFileSync(p, s);
console.log("team page permissions wired");
