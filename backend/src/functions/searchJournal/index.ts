import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../../common/dynamo";
import { getUserId } from "../../common/auth";
import { jsonResponse, errorResponse } from "../../common/http";
import { embedText, cosineSimilarity } from "../../common/bedrock";
import type { JournalEntry } from "../../common/types";

const TOP_K = 5;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) return errorResponse(400, "query is required");

  // Brute-force cosine similarity over the user's full journal partition — cheap at personal
  // scale (a few hundred to low-thousands of entries per user), no vector DB needed.
  const [queryEmbedding, journalResult] = await Promise.all([
    embedText(query),
    ddb.send(
      new QueryCommand({
        TableName: process.env.JOURNAL_TABLE_NAME,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
      }),
    ),
  ]);

  const entries = (journalResult.Items ?? []) as JournalEntry[];
  const scored = entries
    .filter((entry): entry is JournalEntry & { embedding: number[] } => Array.isArray(entry.embedding))
    .map((entry) => ({
      date: entry.date,
      text: entry.text,
      score: cosineSimilarity(queryEmbedding, entry.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);

  return jsonResponse(200, { entries: scored });
};
