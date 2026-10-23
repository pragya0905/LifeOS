import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import type { RoutineStepStatus, RoutineTemplate } from "../../common/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: RoutineStepStatus[] = ["done", "skipped", "not_applicable"];
const MAX_NOTE_LENGTH = 200;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const date = event.pathParameters?.date ?? "";
  const routineId = event.pathParameters?.routineId;
  const stepIndexRaw = event.pathParameters?.stepIndex;

  if (!DATE_RE.test(date)) return errorResponse(400, "date must be YYYY-MM-DD");
  if (!routineId) return errorResponse(400, "Missing routine id");
  const stepIndex = Number(stepIndexRaw);
  if (!Number.isInteger(stepIndex) || stepIndex < 0) {
    return errorResponse(400, "stepIndex must be a non-negative integer");
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  if (!STATUSES.includes(body.status as RoutineStepStatus)) {
    return errorResponse(400, `status must be one of ${STATUSES.join(", ")}`);
  }
  if (body.note !== undefined && typeof body.note !== "string") {
    return errorResponse(400, "note must be a string");
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, MAX_NOTE_LENGTH) : undefined;

  // Guards against writing a log against a routineId/stepIndex that doesn't actually exist —
  // most importantly a hallucinated routineId from the Assistant, which has no UI form to
  // catch a typo'd or made-up id the way a human clicking a real button would.
  const routine = await ddb.send(
    new GetCommand({ TableName: process.env.ROUTINE_TEMPLATES_TABLE_NAME, Key: { userId, routineId } }),
  );
  if (!routine.Item) return errorResponse(404, "Routine not found");
  if (stepIndex >= (routine.Item as RoutineTemplate).steps.length) {
    return errorResponse(400, "stepIndex is out of range for this routine");
  }

  const now = new Date().toISOString();
  const dateRoutineStep = `${date}#${routineId}#${stepIndex}`;

  // A manual edit always reasserts human ownership of this field, even over an existing
  // ai-journal-sourced entry. note is only touched when explicitly provided: omitted leaves
  // any existing note alone, an empty string clears it.
  let updateExpression =
    "SET #date = :date, #routineId = :routineId, #stepIndex = :stepIndex, #status = :status, " +
    "#source = :source, updatedAt = :updatedAt, createdAt = if_not_exists(createdAt, :updatedAt)";
  const names: Record<string, string> = {
    "#date": "date",
    "#routineId": "routineId",
    "#stepIndex": "stepIndex",
    "#status": "status",
    "#source": "source",
  };
  const values: Record<string, unknown> = {
    ":date": date,
    ":routineId": routineId,
    ":stepIndex": stepIndex,
    ":status": body.status,
    ":source": "manual",
    ":updatedAt": now,
  };
  if (note !== undefined) {
    names["#note"] = "note";
    if (note.length > 0) {
      updateExpression += ", #note = :note";
      values[":note"] = note;
    } else {
      updateExpression += " REMOVE #note";
    }
  }

  const result = await ddb.send(
    new UpdateCommand({
      TableName: process.env.ROUTINE_LOGS_TABLE_NAME,
      Key: { userId, dateRoutineStep },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }),
  );

  // stepName is the step's own text, so the chat can show which step was logged. Additive key.
  const stepName = (routine.Item as RoutineTemplate).steps[stepIndex];
  return jsonResponse(200, { ...result.Attributes, stepName });
};
