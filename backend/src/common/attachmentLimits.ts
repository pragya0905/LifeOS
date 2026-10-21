import type { HeadObjectCommand } from "@aws-sdk/client-s3";

// Anthropic's Messages API caps the whole request body at 32 MB (platform.claude.com/docs/en/api/overview).
// Base64 inflates raw bytes by 4/3, so 20 MB of attachments is ~26.7 MB on the wire, leaving
// ~4 MB for the system prompt, up to 40 history turns, and the tool schemas.
export const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

// Anthropic's per-image limit is 10 MB *base64-encoded* on the direct API (5 MB on Bedrock/Vertex);
// 7 MiB raw is ~9.8 MB encoded, so anything under this can't trip it.
export const MAX_IMAGE_BYTES = 7 * 1024 * 1024;

export interface HeadClient {
  send(command: HeadObjectCommand): Promise<{ ContentLength?: number }>;
}

export type TotalSizeCheck =
  | { ok: true; totalBytes: number }
  | { ok: false; status: 400 | 503; error: string };

// HeadObject has no response body, so S3 reports a missing key as a bare "NotFound" (404) — and,
// when the caller lacks s3:ListBucket, reports it as a 403 instead. Both mean "that key isn't
// there for you", and both must surface as the same clean 400, never a 500.
export function isMissingObjectError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  const status = e.$metadata?.httpStatusCode;
  if (status === 404 || status === 403) return true;
  const name = e.name ?? e.Code;
  return name === "NotFound" || name === "NoSuchKey" || name === "AccessDenied" || name === "Forbidden";
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function checkAttachmentTotalSize(
  client: HeadClient,
  makeCommand: (key: string) => HeadObjectCommand,
  keys: string[],
): Promise<TotalSizeCheck> {
  const settled = await Promise.allSettled(keys.map((key) => client.send(makeCommand(key))));

  const failures = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failures.some((f) => isMissingObjectError(f.reason))) {
    return { ok: false, status: 400, error: "attachments could not be found" };
  }
  if (failures.length > 0) {
    // Not a client mistake (throttling, S3 outage…) — retryable, so not a 400.
    return { ok: false, status: 503, error: "Could not verify attachments, please try again" };
  }

  const totalBytes = settled.reduce(
    (sum, r) => sum + (r.status === "fulfilled" ? (r.value.ContentLength ?? 0) : 0),
    0,
  );
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    return {
      ok: false,
      status: 400,
      error: `Attachments are too large together (${formatMb(totalBytes)}; max ${formatMb(MAX_TOTAL_ATTACHMENT_BYTES)} total)`,
    };
  }
  return { ok: true, totalBytes };
}
