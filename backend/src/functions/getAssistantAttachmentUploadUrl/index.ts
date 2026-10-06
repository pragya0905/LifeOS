import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";

const s3 = new S3Client({});
const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

// Same presigned-PUT pattern as getWishImageUploadUrl — the file never passes through
// Lambda/API Gateway on the way up. Objects here are transient scratch space for the
// chatAssistant Lambda to read once (see its ASSISTANT_ATTACHMENTS_BUCKET_NAME usage) and
// expire automatically via the bucket's lifecycle rule, so keys aren't tied to any other
// resource — just the caller's own userId.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return errorResponse(400, `contentType must be one of ${ALLOWED_CONTENT_TYPES.join(", ")}`);
  }

  const extension = contentType.split("/")[1];
  const key = `${userId}/${randomUUID()}.${extension}`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: process.env.ASSISTANT_ATTACHMENTS_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 300 },
  );

  return jsonResponse(200, { uploadUrl, key });
};
