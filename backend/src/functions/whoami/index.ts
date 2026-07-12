import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const claims = event.requestContext.authorizer?.jwt?.claims;

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "LifeOs API is alive",
      userId: claims?.sub ?? null,
      email: claims?.email ?? null,
      timestamp: new Date().toISOString(),
    }),
  };
};
