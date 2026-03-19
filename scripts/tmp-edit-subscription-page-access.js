const fs = require("fs");
const p = "app/dashboard/subscription/page.tsx";
let s = fs.readFileSync(p, "utf8");

s = s.replace(
`  const isLoading = data === undefined;
  const subs = data || [];`,
`  const isLoading = data === undefined;
  const subs = Array.isArray(data) ? data : [];
  const accessError = !Array.isArray(data) ? data?.error : null;`
);

s = s.replace(
`      {actionStatus && (
        <div>
          <Alert variant={actionStatus.variant}>{actionStatus.message}</Alert>
        </div>
      )}`,
`      {actionStatus && (
        <div>
          <Alert variant={actionStatus.variant}>{actionStatus.message}</Alert>
        </div>
      )}

      {accessError ? (
        <div>
          <Alert variant="error">{String(accessError)}</Alert>
        </div>
      ) : null}`
);

fs.writeFileSync(p, s);
console.log("subscription page access guard updated");
