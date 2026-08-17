import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

export function getUserId(event: APIGatewayProxyEventV2WithJWTAuthorizer): string {
  const sub = event.requestContext.authorizer?.jwt?.claims?.sub;
  if (typeof sub !== "string") {
    throw new Error("Missing sub claim on authorizer context");
  }
  return sub;
}

// The Cognito admin APIs (e.g. AdminDeleteUser) need the pool "Username", which in this
// pool is the user's email — distinct from the immutable `sub` used as the DynamoDB
// partition key everywhere else. ID tokens carry it as the cognito:username claim.
export function getUsername(event: APIGatewayProxyEventV2WithJWTAuthorizer): string {
  const username = event.requestContext.authorizer?.jwt?.claims?.["cognito:username"];
  if (typeof username !== "string") {
    throw new Error("Missing cognito:username claim on authorizer context");
  }
  return username;
}
