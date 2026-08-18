import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import type { Wish } from "../../common/types";

const s3 = new S3Client({});

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const wishId = event.pathParameters?.id;
  const key = event.queryStringParameters?.key;
  if (!wishId) return errorResponse(400, "Missing wish id");
  if (!key) return errorResponse(400, "key query parameter is required");
  // The key is namespaced by userId (see getWishImageUploadUrl) — reject anything that
  // doesn't start with this caller's own prefix rather than trust the query param blindly.
  if (!key.startsWith(`${userId}/`)) return errorResponse(403, "Not your image");

  const existing = await ddb.send(
    new GetCommand({ TableName: process.env.WISHES_TABLE_NAME, Key: { userId, wishId } }),
  );
  const wish = existing.Item as Wish | undefined;
  if (!wish) return errorResponse(404, "Wish not found");

  await s3.send(
    new DeleteObjectCommand({ Bucket: process.env.WISH_IMAGES_BUCKET_NAME, Key: key }),
  );

  const nextKeys = (wish.imageKeys ?? []).filter((k) => k !== key);
  await ddb.send(
    new UpdateCommand({
      TableName: process.env.WISHES_TABLE_NAME,
      Key: { userId, wishId },
      UpdateExpression: "SET imageKeys = :keys, updatedAt = :now",
      ExpressionAttributeValues: { ":keys": nextKeys, ":now": new Date().toISOString() },
    }),
  );

  return jsonResponse(200, { deleted: true });
};
