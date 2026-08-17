import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse } from "../../common/http";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);

  const result = await ddb.send(
    new GetCommand({ TableName: process.env.USER_PROFILE_TABLE_NAME, Key: { userId } }),
  );

  return jsonResponse(200, result.Item ?? { userId });
};
