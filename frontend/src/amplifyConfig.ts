import { Amplify } from "aws-amplify";

const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
const userPoolClientId = import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID;

if (!userPoolId || !userPoolClientId) {
  throw new Error(
    "Missing VITE_COGNITO_USER_POOL_ID / VITE_COGNITO_USER_POOL_CLIENT_ID env vars",
  );
}

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId,
      userPoolClientId,
    },
  },
});
