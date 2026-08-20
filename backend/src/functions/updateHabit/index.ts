import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import type { HabitType, HabitUnit } from "../../common/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HABIT_TYPES: HabitType[] = ["water", "exercise", "steps"];
const HABIT_UNIT: Record<HabitType, HabitUnit> = {
  water: "ml",
  exercise: "minutes",
  steps: "steps",
};

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const date = event.pathParameters?.date ?? "";
  const habitType = event.pathParameters?.type ?? "";

  if (!DATE_RE.test(date)) return errorResponse(400, "date must be YYYY-MM-DD");
  if (!HABIT_TYPES.includes(habitType as HabitType)) {
    return errorResponse(400, `type must be one of ${HABIT_TYPES.join(", ")}`);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  if (typeof body.value !== "number" || !Number.isFinite(body.value) || body.value < 0) {
    return errorResponse(400, "value must be a non-negative number");
  }
  const note = typeof body.note === "string" ? body.note : undefined;

  const now = new Date().toISOString();
  const status = body.value > 0 ? "done" : "missed";
  const names: Record<string, string> = {
    "#date": "date",
    "#habitType": "habitType",
    "#status": "status",
    "#value": "value",
    "#unit": "unit",
    "#source": "source",
  };
  const values: Record<string, unknown> = {
    ":date": date,
    ":habitType": habitType,
    ":status": status,
    ":value": body.value,
    ":unit": HABIT_UNIT[habitType as HabitType],
    ":source": "manual",
    ":updatedAt": now,
    ":createdAt": now,
  };
  let setExpr =
    "#date = :date, #habitType = :habitType, #status = :status, #value = :value, " +
    "#unit = :unit, #source = :source, updatedAt = :updatedAt, " +
    "createdAt = if_not_exists(createdAt, :createdAt)";

  if (note !== undefined) {
    names["#note"] = "note";
    values[":note"] = note;
    setExpr += ", #note = :note";
  }

  const result = await ddb.send(
    new UpdateCommand({
      TableName: process.env.HABITS_TABLE_NAME,
      Key: { userId, dateHabitType: `${date}#${habitType}` },
      UpdateExpression: `SET ${setExpr}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }),
  );

  return jsonResponse(200, result.Attributes);
};
