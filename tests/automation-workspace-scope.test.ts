import assert from "node:assert/strict";
import { buildAutomationFlowWhere, buildAutomationRunWhere, type AutomationScope } from "../lib/automation/access";

const workspaceScope: AutomationScope = {
  actorUserId: "user_actor",
  ownerUserId: "user_owner",
  businessId: "biz_123",
  source: "workspace",
};

const personalScope: AutomationScope = {
  actorUserId: "user_actor",
  ownerUserId: "user_actor",
  businessId: null,
  source: "personal",
};

assert.deepEqual(buildAutomationFlowWhere(workspaceScope, { id: "flow_1" }), {
  businessId: "biz_123",
  id: "flow_1",
});

assert.deepEqual(buildAutomationFlowWhere(personalScope, { id: "flow_2" }), {
  businessId: null,
  userId: "user_actor",
  id: "flow_2",
});

assert.deepEqual(buildAutomationRunWhere(workspaceScope, { id: "run_1" }), {
  flow: { businessId: "biz_123" },
  id: "run_1",
});

assert.deepEqual(buildAutomationRunWhere(personalScope, { id: "run_2" }), {
  userId: "user_actor",
  flow: { businessId: null },
  id: "run_2",
});

console.log("ok automation workspace scope rules passed");
