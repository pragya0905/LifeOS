import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import type { AssistantModel, AssistantTone, UserSex } from "../../common/types";

const SEX_VALUES: UserSex[] = ["male", "female", "unspecified"];
const ASSISTANT_MODEL_VALUES: AssistantModel[] = ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"];
const ASSISTANT_TONE_VALUES: AssistantTone[] = ["warm", "direct", "playful"];
const MAX_PREFERRED_NAME_LENGTH = 40;
const MAX_LOCATION_LENGTH = 100;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  if (
    body.heightCm !== undefined &&
    (typeof body.heightCm !== "number" || !Number.isFinite(body.heightCm) || body.heightCm <= 0)
  ) {
    return errorResponse(400, "heightCm must be a positive number");
  }
  if (
    body.monthlyBudget !== undefined &&
    (typeof body.monthlyBudget !== "number" || !Number.isFinite(body.monthlyBudget) || body.monthlyBudget <= 0)
  ) {
    return errorResponse(400, "monthlyBudget must be a positive number");
  }
  if (body.onboardingCompleted !== undefined && body.onboardingCompleted !== true) {
    return errorResponse(400, "onboardingCompleted must be true");
  }
  if (body.sex !== undefined && !SEX_VALUES.includes(body.sex as UserSex)) {
    return errorResponse(400, `sex must be one of ${SEX_VALUES.join(", ")}`);
  }
  if (body.assistantModel !== undefined && !ASSISTANT_MODEL_VALUES.includes(body.assistantModel as AssistantModel)) {
    return errorResponse(400, `assistantModel must be one of ${ASSISTANT_MODEL_VALUES.join(", ")}`);
  }
  if (
    body.preferredName !== undefined &&
    (typeof body.preferredName !== "string" ||
      body.preferredName.trim().length === 0 ||
      body.preferredName.length > MAX_PREFERRED_NAME_LENGTH)
  ) {
    return errorResponse(400, `preferredName must be a non-empty string up to ${MAX_PREFERRED_NAME_LENGTH} characters`);
  }
  if (body.assistantTone !== undefined && !ASSISTANT_TONE_VALUES.includes(body.assistantTone as AssistantTone)) {
    return errorResponse(400, `assistantTone must be one of ${ASSISTANT_TONE_VALUES.join(", ")}`);
  }
  if (
    body.location !== undefined &&
    (typeof body.location !== "string" || body.location.trim().length === 0 || body.location.length > MAX_LOCATION_LENGTH)
  ) {
    return errorResponse(400, `location must be a non-empty string up to ${MAX_LOCATION_LENGTH} characters`);
  }
  if (
    body.heightCm === undefined &&
    body.monthlyBudget === undefined &&
    body.onboardingCompleted === undefined &&
    body.sex === undefined &&
    body.assistantModel === undefined &&
    body.preferredName === undefined &&
    body.assistantTone === undefined &&
    body.location === undefined
  ) {
    return errorResponse(400, "No updatable fields provided");
  }

  const now = new Date().toISOString();
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ":updatedAt": now };
  const setClauses = ["updatedAt = :updatedAt"];

  if (body.heightCm !== undefined) {
    names["#heightCm"] = "heightCm";
    values[":heightCm"] = body.heightCm;
    setClauses.push("#heightCm = :heightCm");
  }
  if (body.monthlyBudget !== undefined) {
    names["#monthlyBudget"] = "monthlyBudget";
    values[":monthlyBudget"] = body.monthlyBudget;
    setClauses.push("#monthlyBudget = :monthlyBudget");
  }
  if (body.sex !== undefined) {
    names["#sex"] = "sex";
    values[":sex"] = body.sex;
    setClauses.push("#sex = :sex");
  }
  if (body.assistantModel !== undefined) {
    names["#assistantModel"] = "assistantModel";
    values[":assistantModel"] = body.assistantModel;
    setClauses.push("#assistantModel = :assistantModel");
  }
  if (body.preferredName !== undefined) {
    names["#preferredName"] = "preferredName";
    values[":preferredName"] = (body.preferredName as string).trim();
    setClauses.push("#preferredName = :preferredName");
  }
  if (body.assistantTone !== undefined) {
    names["#assistantTone"] = "assistantTone";
    values[":assistantTone"] = body.assistantTone;
    setClauses.push("#assistantTone = :assistantTone");
  }
  if (body.location !== undefined) {
    names["#location"] = "location";
    values[":location"] = (body.location as string).trim();
    setClauses.push("#location = :location");
  }
  if (body.onboardingCompleted === true) {
    // Stamped server-side (not client-supplied) so it can't be forged/skewed by the client clock.
    names["#onboardingCompletedAt"] = "onboardingCompletedAt";
    values[":onboardingCompletedAt"] = now;
    setClauses.push("#onboardingCompletedAt = :onboardingCompletedAt");
  }

  const result = await ddb.send(
    new UpdateCommand({
      TableName: process.env.USER_PROFILE_TABLE_NAME,
      Key: { userId },
      UpdateExpression: `SET ${setClauses.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }),
  );

  return jsonResponse(200, result.Attributes);
};
