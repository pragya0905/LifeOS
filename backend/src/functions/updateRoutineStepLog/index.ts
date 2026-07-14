import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import type { RoutineStepStatus } from "../../common/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: RoutineStepStatus[] = ["done", "skipped"];

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

  const now = new Date().toISOString();
  const dateRoutineStep = `${date}#${routineId}#${stepIndex}`;

  const result = await ddb.send(
    new UpdateCommand({
      TableName: process.env.ROUTINE_LOGS_TABLE_NAME,
      Key: { userId, dateRoutineStep },
      UpdateExpression:
        "SET #date = :date, #routineId = :routineId, #stepIndex = :stepIndex, #status = :status, " +
        "updatedAt = :updatedAt, createdAt = if_not_exists(createdAt, :updatedAt)",
      ExpressionAttributeNames: {
        "#date": "date",
        "#routineId": "routineId",
        "#stepIndex": "stepIndex",
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":date": date,
        ":routineId": routineId,
        ":stepIndex": stepIndex,
        ":status": body.status,
        ":updatedAt": now,
      },
      ReturnValues: "ALL_NEW",
    }),
  );

  return jsonResponse(200, result.Attributes);
};
