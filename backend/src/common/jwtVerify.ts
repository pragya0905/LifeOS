import { CognitoJwtVerifier } from "aws-jwt-verify";

// Only needed by chatAssistant, which runs behind a Lambda Function URL (required for
// response streaming) rather than API Gateway — Function URLs don't support Cognito JWT
// authorizers, so this is the one place in the app that verifies a token by hand instead of
// trusting API Gateway's own verification. Accepts the same two client IDs the shared
// HttpApi CognitoAuthorizer's `audience` list already accepts (see template.yaml).
let cachedVerifier: ReturnType<typeof CognitoJwtVerifier.create> | undefined;

function getVerifier() {
  if (!cachedVerifier) {
    cachedVerifier = CognitoJwtVerifier.create({
      userPoolId: process.env.USER_POOL_ID as string,
      tokenUse: "id",
      clientId: [process.env.WEB_CLIENT_ID as string, process.env.ALEXA_CLIENT_ID as string],
    });
  }
  return cachedVerifier;
}

export async function verifyIdToken(authHeader: string | undefined): Promise<string> {
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : authHeader;
  if (!token) throw new Error("Missing bearer token");
  const payload = await getVerifier().verify(token);
  return payload.sub;
}
