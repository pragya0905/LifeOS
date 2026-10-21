import { describe, it, expect } from "vitest";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import {
  checkAttachmentTotalSize,
  isMissingObjectError,
  MAX_TOTAL_ATTACHMENT_BYTES,
  type HeadClient,
} from "./attachmentLimits";

const mk = (key: string) => new HeadObjectCommand({ Bucket: "b", Key: key });

function fakeClient(byKey: Record<string, number | Error>): HeadClient {
  return {
    async send(command) {
      const v = byKey[command.input.Key as string];
      if (v instanceof Error) throw v;
      return { ContentLength: v };
    },
  };
}

function s3Error(name: string, httpStatusCode: number): Error {
  return Object.assign(new Error(name), { name, $metadata: { httpStatusCode } });
}

describe("isMissingObjectError", () => {
  it.each([
    ["NotFound", 404],
    ["Forbidden", 403],
    ["NoSuchKey", 404],
    ["AccessDenied", 403],
  ])("treats %s (%i) as missing", (name, status) => {
    expect(isMissingObjectError(s3Error(name, status))).toBe(true);
  });

  it("treats name-only errors as missing", () => {
    expect(isMissingObjectError({ name: "NoSuchKey" })).toBe(true);
    expect(isMissingObjectError({ Code: "AccessDenied" })).toBe(true);
  });

  it("does not treat throttling/500 as missing", () => {
    expect(isMissingObjectError(s3Error("SlowDown", 503))).toBe(false);
    expect(isMissingObjectError(s3Error("InternalError", 500))).toBe(false);
    expect(isMissingObjectError(undefined)).toBe(false);
  });
});

describe("checkAttachmentTotalSize", () => {
  it("passes when the total is under the cap", async () => {
    const r = await checkAttachmentTotalSize(fakeClient({ a: 1_000_000, b: 2_000_000 }), mk, ["a", "b"]);
    expect(r).toEqual({ ok: true, totalBytes: 3_000_000 });
  });

  it("passes at exactly the cap and rejects one byte over", async () => {
    const half = MAX_TOTAL_ATTACHMENT_BYTES / 2;
    expect((await checkAttachmentTotalSize(fakeClient({ a: half, b: half }), mk, ["a", "b"])).ok).toBe(true);
    const over = await checkAttachmentTotalSize(fakeClient({ a: half, b: half + 1 }), mk, ["a", "b"]);
    expect(over).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects a 404 (NotFound) with a clean 400", async () => {
    const r = await checkAttachmentTotalSize(fakeClient({ a: 10, b: s3Error("NotFound", 404) }), mk, ["a", "b"]);
    expect(r).toEqual({ ok: false, status: 400, error: "attachments could not be found" });
  });

  it("rejects a 403 (AccessDenied) with the same clean 400", async () => {
    const r = await checkAttachmentTotalSize(fakeClient({ a: s3Error("Forbidden", 403) }), mk, ["a"]);
    expect(r).toEqual({ ok: false, status: 400, error: "attachments could not be found" });
  });

  it("reports missing even when another key hit a transient error", async () => {
    const r = await checkAttachmentTotalSize(
      fakeClient({ a: s3Error("SlowDown", 503), b: s3Error("NotFound", 404) }),
      mk,
      ["a", "b"],
    );
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("returns a retryable 503, never throws, on other S3 errors", async () => {
    const r = await checkAttachmentTotalSize(fakeClient({ a: s3Error("InternalError", 500) }), mk, ["a"]);
    expect(r).toMatchObject({ ok: false, status: 503 });
  });
});
