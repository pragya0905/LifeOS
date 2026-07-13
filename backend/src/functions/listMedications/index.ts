import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse } from "../../common/http";
import { computeEndDate } from "../../common/medications";
import type { Medication } from "../../common/types";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);

  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.MEDICATIONS_TABLE_NAME,
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": userId },
    }),
  );

  const medications = (result.Items ?? []) as Medication[];
  const withEndDate = medications.map((medication) => ({
    ...medication,
    endDate: computeEndDate(medication.startDate, medication.durationDays),
  }));

  return jsonResponse(200, { medications: withEndDate });
};
