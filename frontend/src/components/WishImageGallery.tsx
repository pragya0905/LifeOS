import { useEffect, useRef, useState } from "react";
import { useApi } from "../api/useApi";
import type { WishImage } from "../types";
import { errorText, mutedText, secondaryButton } from "./ui";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export default function WishImageGallery({ wishId }: { wishId: string }) {
  const { request } = useApi();
  const [images, setImages] = useState<WishImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadImages() {
    setLoading(true);
    try {
      const data = await request<{ images: WishImage[] }>(`/wishes/${wishId}/images`);
      setImages(data.images);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load images");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wishId]);

  async function handleFileSelected(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Only JPEG, PNG, WEBP, or GIF images are supported");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const { uploadUrl, key } = await request<{ uploadUrl: string; key: string }>(
        `/wishes/${wishId}/images/presign`,
        { method: "POST", body: JSON.stringify({ contentType: file.type }) },
      );
      const putResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putResponse.ok) throw new Error("Upload to storage failed");
      const newImageKeys = [...images.map((img) => img.key), key];
      await request(`/wishes/${wishId}`, {
        method: "PATCH",
        body: JSON.stringify({ imageKeys: newImageKeys }),
      });
      await loadImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(key: string) {
    setError(null);
    try {
      await request(`/wishes/${wishId}/images?key=${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      setImages((prev) => prev.filter((img) => img.key !== key));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete image");
    }
  }

  return (
    <div className="mt-2">
      {loading ? (
        <p className={mutedText}>Loading images...</p>
      ) : (
        images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((img) => (
              <div key={img.key} className="group relative">
                <img
                  src={img.url}
                  alt=""
                  loading="lazy"
                  className="h-16 w-16 rounded-lg border border-stone object-cover dark:border-stone-dark"
                />
                <button
                  type="button"
                  onClick={() => handleDelete(img.key)}
                  title="Remove image"
                  aria-label="Remove image"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-alert text-xs text-paper-card opacity-80 transition-opacity hover:opacity-100"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )
      )}
      {error && <p className={`mb-1 ${errorText}`}>{error}</p>}
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelected(file);
        }}
        className="hidden"
        id={`wish-image-input-${wishId}`}
      />
      <label
        htmlFor={`wish-image-input-${wishId}`}
        className={`${secondaryButton} inline-block cursor-pointer px-2 py-1 text-xs ${uploading ? "opacity-50" : ""}`}
      >
        {uploading ? "Uploading..." : "Add photo"}
      </label>
    </div>
  );
}
