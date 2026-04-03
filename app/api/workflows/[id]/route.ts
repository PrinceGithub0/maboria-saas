import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
const WORKFLOW_API_REMOVED_RESPONSE = {
  error: "Workflow API removed",
  reason: "Use the automations surface instead of the retired workflow endpoints.",
};

export const GET = withErrorHandling(async () => NextResponse.json(WORKFLOW_API_REMOVED_RESPONSE, { status: 410 }));

export const PUT = withErrorHandling(async () => NextResponse.json(WORKFLOW_API_REMOVED_RESPONSE, { status: 410 }));

export const DELETE = withErrorHandling(async () => NextResponse.json(WORKFLOW_API_REMOVED_RESPONSE, { status: 410 }));
