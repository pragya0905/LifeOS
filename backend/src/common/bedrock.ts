import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

// Titan Embeddings — kept entirely inside the existing AWS account (IAM auth, no new vendor
// API key), consistent with this project's preference for AWS-native solutions when the
// quality gap over a specialized embeddings vendor doesn't matter at personal scale.
const TITAN_EMBED_MODEL_ID = "amazon.titan-embed-text-v2:0";

let cachedClient: BedrockRuntimeClient | undefined;

function getClient(): BedrockRuntimeClient {
  if (!cachedClient) cachedClient = new BedrockRuntimeClient({});
  return cachedClient;
}

export async function embedText(text: string): Promise<number[]> {
  const client = getClient();
  const response = await client.send(
    new InvokeModelCommand({
      modelId: TITAN_EMBED_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({ inputText: text }),
    }),
  );
  const parsed = JSON.parse(new TextDecoder().decode(response.body)) as { embedding: number[] };
  return parsed.embedding;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
