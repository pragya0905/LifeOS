import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import type { Wish } from "../../common/types";

const s3 = new S3Client({});

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const wishId = event.pathParameters?.id;
  if (!wishId) return errorResponse(400, "Missing wish id");

  const existing = await ddb.send(
    new GetCommand({ TableName: process.env.WISHES_TABLE_NAME, Key: { userId, wishId } }),
  );
  const wish = existing.Item as Wish | undefined;

  if (wish?.imageKeys && wish.imageKeys.length > 0) {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: process.env.WISH_IMAGES_BUCKET_NAME,
        Delete: { Objects: wish.imageKeys.map((key) => ({ Key: key })) },
      }),
    );
  }

  await ddb.send(
    new DeleteCommand({ TableName: process.env.WISHES_TABLE_NAME, Key: { userId, wishId } }),
  );

  return jsonResponse(200, { deleted: true });
};
