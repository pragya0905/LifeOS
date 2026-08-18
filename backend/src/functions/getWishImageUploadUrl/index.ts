import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";

const s3 = new S3Client({});
const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// The client uploads the file directly to S3 using this URL — the binary never passes
// through Lambda/API Gateway, which would otherwise hit their payload size limits.
// Keys are namespaced under the caller's own userId so a presigned URL can never be
// used to write into another user's prefix.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const wishId = event.pathParameters?.id;
  if (!wishId) return errorResponse(400, "Missing wish id");

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
  const key = `${userId}/${wishId}/${randomUUID()}.${extension}`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: process.env.WISH_IMAGES_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 300 },
  );

  return jsonResponse(200, { uploadUrl, key });
};
