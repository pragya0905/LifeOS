import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import type { Wish } from "../../common/types";

const s3 = new S3Client({});

// The bucket is private, so viewing an image means generating a short-lived signed GET
// URL on demand each time — regenerated fresh on every page load rather than stored,
// since a stored URL would just expire anyway.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const wishId = event.pathParameters?.id;
  if (!wishId) return errorResponse(400, "Missing wish id");

  const result = await ddb.send(
    new GetCommand({ TableName: process.env.WISHES_TABLE_NAME, Key: { userId, wishId } }),
  );
  const wish = result.Item as Wish | undefined;
  if (!wish) return errorResponse(404, "Wish not found");

  const images = await Promise.all(
    (wish.imageKeys ?? []).map(async (key) => ({
      key,
      url: await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: process.env.WISH_IMAGES_BUCKET_NAME, Key: key }),
        { expiresIn: 3600 },
      ),
    })),
  );

  return jsonResponse(200, { images });
};
