import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import { generateDailyReflection } from "../../common/claude";

function nonNegInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}

// Stateless, like suggestTimelinePlacements: the body carries only counts the client already
// computed from its own data (plannedCount, doneCount, and per-kind minutes) — never titles,
// notes, or health/cycle detail — so nothing sensitive reaches the model or gets logged.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  getUserId(event);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const summary = {
    plannedCount: nonNegInt(body.plannedCount),
    doneCount: nonNegInt(body.doneCount),
    sleepMinutes: nonNegInt(body.sleepMinutes),
    routineMinutes: nonNegInt(body.routineMinutes),
    taskMinutes: nonNegInt(body.taskMinutes),
  };
  if (summary.plannedCount === 0 && summary.doneCount === 0 && summary.sleepMinutes === 0 && summary.routineMinutes === 0 && summary.taskMinutes === 0) {
    return errorResponse(400, "At least one count must be greater than zero");
  }

  try {
    const reflection = await generateDailyReflection(summary);
    return jsonResponse(200, { reflection });
  } catch (err) {
    console.error("Daily reflection failed:", err);
    return jsonResponse(200, { reflection: null });
  }
};
