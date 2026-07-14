import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { errorResponse } from "../../common/http";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const routineId = event.pathParameters?.id;
  if (!routineId) return errorResponse(400, "Missing routine id");

  try {
    await ddb.send(
      new DeleteCommand({
        TableName: process.env.ROUTINE_TEMPLATES_TABLE_NAME,
        Key: { userId, routineId },
        ConditionExpression: "attribute_exists(userId)",
      }),
    );
  } catch (err) {
    if (err instanceof Error && err.name === "ConditionalCheckFailedException") {
      return errorResponse(404, "Routine not found");
    }
    throw err;
  }

  return { statusCode: 204 };
};
