import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "../api/useApi";
import type { AssistantAttachmentRef } from "./useAssistantStream";

export const ALLOWED_ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

// Mirrors the backend limits (chatAssistant/index.ts and common/attachmentLimits.ts), in MiB
// like the server. The server is still the authority — these exist so the user hears about a
// problem before a send fails.
export const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_ATTACHMENT_BYTES = 7 * 1024 * 1024;
export const MAX_PDF_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export type AttachmentStatus = "uploading" | "ready" | "error";

export interface PendingAttachment {
  id: string;
  file: File;
  status: AttachmentStatus;
  // 0..1 while uploading — real bytes-sent progress from an XHR upload, not a guess.
  progress: number;
  previewUrl?: string;
  ref?: AssistantAttachmentRef;
}

export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function previewFor(file: File): string | undefined {
  return file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
}

// fetch() can't report upload progress, so the S3 PUT goes through XHR for the progress bar.
function putFile(
  url: string,
  file: File,
  onProgress: (fraction: number) => void,
  onStart: (xhr: XMLHttpRequest) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    onStart(xhr);
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.send(file);
  });
}

// The composer's attachment tray. Every file uploads independently and in parallel, so one
// failure never holds up the others. Only "ready" items are sent with a message.
export function usePendingAttachments() {
  const { request } = useApi();
  const [items, setItems] = useState<PendingAttachment[]>([]);
  // Mirrors `items` synchronously. Sending reads the tray right after an upload finishes, and
  // a state read there could be a render behind.
  const itemsRef = useRef<PendingAttachment[]>([]);
  const xhrsRef = useRef(new Map<string, XMLHttpRequest>());

  const commit = useCallback((next: PendingAttachment[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const patch = useCallback(
    (id: string, changes: Partial<PendingAttachment>) => {
      const current = itemsRef.current;
      // Removed while uploading — the upload's result has nowhere to go, so drop it.
      if (!current.some((i) => i.id === id)) return;
      commit(current.map((i) => (i.id === id ? { ...i, ...changes } : i)));
    },
    [commit],
  );

  const runUpload = useCallback(
    async (id: string, file: File) => {
      patch(id, { status: "uploading", progress: 0 });
      try {
        const { uploadUrl, key } = await request<{ uploadUrl: string; key: string }>(
          "/assistant/attachments/presign",
          { method: "POST", body: JSON.stringify({ contentType: file.type }) },
        );
        await putFile(
          uploadUrl,
          file,
          (fraction) => patch(id, { progress: fraction }),
          (xhr) => xhrsRef.current.set(id, xhr),
        );
        patch(id, { status: "ready", progress: 1, ref: { key, contentType: file.type, fileName: file.name } });
      } catch {
        patch(id, { status: "error" });
      } finally {
        xhrsRef.current.delete(id);
      }
    },
    [patch, request],
  );

  // Returns one message per problem. Files that don't fit are named, never dropped silently.
  const addFiles = useCallback(
    (files: File[]): string[] => {
      const notices: string[] = [];
      const overflow: string[] = [];
      const accepted: PendingAttachment[] = [];
      let room = MAX_ATTACHMENTS_PER_MESSAGE - itemsRef.current.length;
      for (const file of files) {
        if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
          notices.push(`${file.name} isn't supported — use a photo or a PDF`);
          continue;
        }
        const isPdf = file.type === "application/pdf";
        const limit = isPdf ? MAX_PDF_ATTACHMENT_BYTES : MAX_IMAGE_ATTACHMENT_BYTES;
        if (file.size > limit) {
          notices.push(
            `${file.name} is ${formatMegabytes(file.size)} — ${isPdf ? "PDFs must be under 15 MB" : "photos must be under 7 MB"}`,
          );
          continue;
        }
        if (room <= 0) {
          overflow.push(file.name);
          continue;
        }
        room -= 1;
        accepted.push({ id: makeId(), file, status: "uploading", progress: 0, previewUrl: previewFor(file) });
      }
      if (overflow.length > 0) {
        notices.push(`Max ${MAX_ATTACHMENTS_PER_MESSAGE} files per message — not added: ${overflow.join(", ")}`);
      }
      if (accepted.length > 0) {
        commit([...itemsRef.current, ...accepted]);
        for (const a of accepted) void runUpload(a.id, a.file);
      }
      return notices;
    },
    [commit, runUpload],
  );

  const retry = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (item) void runUpload(item.id, item.file);
    },
    [runUpload],
  );

  const remove = useCallback(
    (id: string) => {
      xhrsRef.current.get(id)?.abort();
      const item = itemsRef.current.find((i) => i.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      commit(itemsRef.current.filter((i) => i.id !== id));
    },
    [commit],
  );

  // Takes every ready item out of the tray, for a send. Each one is handed back to `restore`
  // if the send fails before the reply starts, so nothing the user attached is lost.
  const takeReady = useCallback((): PendingAttachment[] => {
    const ready = itemsRef.current.filter((i) => i.status === "ready");
    for (const i of ready) if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
    commit(itemsRef.current.filter((i) => i.status !== "ready"));
    return ready;
  }, [commit]);

  const restore = useCallback(
    (restored: PendingAttachment[]) => {
      const again = restored.map((i) => ({ ...i, previewUrl: previewFor(i.file) }));
      commit([...itemsRef.current, ...again]);
    },
    [commit],
  );

  // Drops previews and cancels uploads when the page goes away.
  useEffect(() => {
    const xhrs = xhrsRef.current;
    return () => {
      for (const i of itemsRef.current) if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
      for (const xhr of xhrs.values()) xhr.abort();
    };
  }, []);

  const anyUploading = items.some((i) => i.status === "uploading");
  const totalBytes = items.reduce((sum, i) => sum + i.file.size, 0);
  const overLimit = totalBytes > MAX_TOTAL_ATTACHMENT_BYTES;

  return { items, addFiles, retry, remove, takeReady, restore, anyUploading, totalBytes, overLimit };
}
