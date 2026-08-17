import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { CognitoIdentityProviderClient, AdminDeleteUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { ddb } from "../../common/dynamo";
import { getUserId, getUsername } from "../../common/auth";
import { jsonResponse } from "../../common/http";

const cognito = new CognitoIdentityProviderClient({});

// One entry per DynamoDB table this account has data in, naming each table's sort-key
// attribute so items can be deleted by their real primary key (Query returns full items,
// so item[sortKeyName] is always present on what comes back).
const TABLES: { envVar: string; sortKeyName: string }[] = [
  { envVar: "TASKS_TABLE_NAME", sortKeyName: "taskId" },
  { envVar: "JOURNAL_TABLE_NAME", sortKeyName: "date" },
  { envVar: "HABITS_TABLE_NAME", sortKeyName: "dateHabitType" },
  { envVar: "MEDICATIONS_TABLE_NAME", sortKeyName: "medicationId" },
  { envVar: "MEDICATION_LOGS_TABLE_NAME", sortKeyName: "dateMedicationId" },
  { envVar: "LOG_ENTRIES_TABLE_NAME", sortKeyName: "logId" },
  { envVar: "ROUTINE_TEMPLATES_TABLE_NAME", sortKeyName: "routineId" },
  { envVar: "ROUTINE_LOGS_TABLE_NAME", sortKeyName: "dateRoutineStep" },
  { envVar: "GOALS_TABLE_NAME", sortKeyName: "metric" },
];

async function deleteAllItemsForUser(tableName: string, sortKeyName: string, userId: string) {
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
        ExclusiveStartKey: lastKey,
      }),
    );
    for (const item of result.Items ?? []) {
      await ddb.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { userId, [sortKeyName]: item[sortKeyName] },
        }),
      );
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
}

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const username = getUsername(event);

  for (const table of TABLES) {
    const tableName = process.env[table.envVar];
    if (!tableName) continue;
    await deleteAllItemsForUser(tableName, table.sortKeyName, userId);
  }

  await cognito.send(
    new AdminDeleteUserCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Username: username,
    }),
  );

  return jsonResponse(200, { deleted: true });
};
