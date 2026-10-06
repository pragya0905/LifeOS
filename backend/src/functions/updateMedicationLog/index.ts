import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import type { MedicationLogStatus } from "../../common/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: MedicationLogStatus[] = ["taken", "missed"];

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const date = event.pathParameters?.date ?? "";
  const medicationId = event.pathParameters?.medicationId;

  if (!DATE_RE.test(date)) return errorResponse(400, "date must be YYYY-MM-DD");
  if (!medicationId) return errorResponse(400, "Missing medication id");

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  if (!STATUSES.includes(body.status as MedicationLogStatus)) {
    return errorResponse(400, `status must be one of ${STATUSES.join(", ")}`);
  }

  // Guards against writing a log against a medicationId that doesn't actually exist — most
  // importantly a hallucinated one from the Assistant, which has no UI form to catch a typo'd
  // or made-up id the way a human clicking a real button on the Medications page would.
  const medication = await ddb.send(
    new GetCommand({ TableName: process.env.MEDICATIONS_TABLE_NAME, Key: { userId, medicationId } }),
  );
  if (!medication.Item) return errorResponse(404, "Medication not found");

  const now = new Date().toISOString();
  const result = await ddb.send(
    new UpdateCommand({
      TableName: process.env.MEDICATION_LOGS_TABLE_NAME,
      Key: { userId, dateMedicationId: `${date}#${medicationId}` },
      // A manual edit always reasserts human ownership of this field, even over an
      // existing ai-journal-sourced entry.
      UpdateExpression:
        "SET #date = :date, #medicationId = :medicationId, #status = :status, " +
        "#source = :source, updatedAt = :updatedAt, createdAt = if_not_exists(createdAt, :updatedAt)",
      ExpressionAttributeNames: {
        "#date": "date",
        "#medicationId": "medicationId",
        "#status": "status",
        "#source": "source",
      },
      ExpressionAttributeValues: {
        ":date": date,
        ":medicationId": medicationId,
        ":status": body.status,
        ":source": "manual",
        ":updatedAt": now,
      },
      ReturnValues: "ALL_NEW",
    }),
  );

  return jsonResponse(200, result.Attributes);
};
