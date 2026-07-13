import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { errorResponse } from "../../common/http";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const logId = event.pathParameters?.id;
  if (!logId) return errorResponse(400, "Missing log id");

  try {
    await ddb.send(
      new DeleteCommand({
        TableName: process.env.LOG_ENTRIES_TABLE_NAME,
        Key: { userId, logId },
        ConditionExpression: "attribute_exists(userId)",
      }),
    );
  } catch (err) {
    if (err instanceof Error && err.name === "ConditionalCheckFailedException") {
      return errorResponse(404, "Log entry not found");
    }
    throw err;
  }

  return { statusCode: 204 };
};
