import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { getUserId } from "../../common/auth";
import { jsonResponse } from "../../common/http";
import { generateInsightsForUser } from "../../common/insights";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const period = event.queryStringParameters?.period === "week" ? "week" : "day";

  const insights = await generateInsightsForUser(userId, period);

  return jsonResponse(200, insights);
};
