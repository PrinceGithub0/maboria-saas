const fs = require("fs");
const p = "app/dashboard/settings/page.tsx";
let s = fs.readFileSync(p, "utf8");

s = s.replace(
`  const { data: me, mutate: refreshMe } = useSWR("/api/user/me", fetcher);`,
`  const { data: me, mutate: refreshMe } = useSWR("/api/user/me", fetcher);
  const canEditOrgSettings = me?.orgRole === "owner" || me?.orgRole === "admin";`
);

s = s.replace(
`  const saveBusinessProfile = async () => {
    if (businessSaving) return;`,
`  const saveBusinessProfile = async () => {
    if (!canEditOrgSettings) return;
    if (businessSaving) return;`
);

s = s.replace(
`  const createPayoutAccount = async () => {
    if (payoutSubmitting) return;`,
`  const createPayoutAccount = async () => {
    if (!canEditOrgSettings) return;
    if (payoutSubmitting) return;`
);

s = s.replace(
`        {logoError && <Alert variant="error">{logoError}</Alert>}`,
`        {logoError && <Alert variant="error">{logoError}</Alert>}
        {!canEditOrgSettings ? (
          <Alert variant="info">{t("You have read-only access for organization settings.", "Acces en lecture seule pour les parametres organisation.")}</Alert>
        ) : null}`
);

s = s.replace(
`              <Button
                className="max-md:w-full"
                onClick={saveBusinessProfile}
                loading={businessSaving || logoUploading}
                disabled={lateFeeForm.lateFeeEnabled && !lateFeeConfigValid}
              >`,
`              <Button
                className="max-md:w-full"
                onClick={saveBusinessProfile}
                loading={businessSaving || logoUploading}
                disabled={!canEditOrgSettings || (lateFeeForm.lateFeeEnabled && !lateFeeConfigValid)}
              >`
);

s = s.replace(
`          {payoutStatus && <div className="mt-3"><Alert variant="success">{payoutStatus}</Alert></div>}
          {payoutError && <div className="mt-3"><Alert variant="error">{payoutError}</Alert></div>}`,
`          {payoutStatus && <div className="mt-3"><Alert variant="success">{payoutStatus}</Alert></div>}
          {payoutError && <div className="mt-3"><Alert variant="error">{payoutError}</Alert></div>}
          {!canEditOrgSettings ? (
            <div className="mt-3"><Alert variant="info">{t("You have read-only access for payout settings.", "Acces en lecture seule pour les parametres de paiement.")}</Alert></div>
          ) : null}`
);

s = s.replace(
`                disabled={
                  payoutSubmitting ||
                  (!isSepa && (!payoutBankList.length || Boolean(payoutBankError))) ||
                  (isSepa && payoutProvider !== "FLUTTERWAVE")
                }`,
`                disabled={
                  !canEditOrgSettings ||
                  payoutSubmitting ||
                  (!isSepa && (!payoutBankList.length || Boolean(payoutBankError))) ||
                  (isSepa && payoutProvider !== "FLUTTERWAVE")
                }`
);

fs.writeFileSync(p, s);
console.log("settings read-only guards updated");
