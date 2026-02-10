import { applyPendingDowngrades } from "../lib/subscription-downgrade";

(async () => {
  const result = await applyPendingDowngrades(new Date());
  console.log(`Applied ${result.applied} pending downgrades`);
})();
