export type UploadedAttachment = {
  id: string;
  storage_key?: string;
  name: string;
  content_type?: string;
  size?: number;
  url: string;
};

const MAX_IMAGE_UPLOAD_BYTES = 900 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function imageToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to process image");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Unable to compress image")),
      "image/jpeg",
      quality,
    );
  });
}

async function prepareUploadFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size <= MAX_IMAGE_UPLOAD_BYTES) {
    return file;
  }

  const canvas = await imageToCanvas(file);
  let blob = await canvasToBlob(canvas, 0.82);

  for (const quality of [0.72, 0.62, 0.52]) {
    if (blob.size <= MAX_IMAGE_UPLOAD_BYTES) break;
    blob = await canvasToBlob(canvas, quality);
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

export async function uploadMessageAttachments(
  apiBase: string,
  token: string,
  files: FileList | File[],
): Promise<UploadedAttachment[]> {
  const fileList = Array.from(files || []);
  if (!fileList.length) return [];

  const tooLarge = fileList.find((file) => file.size > MAX_UPLOAD_BYTES);
  if (tooLarge) {
    throw new Error(`${tooLarge.name || "File"} is larger than the 20MB limit.`);
  }

  const preparedFiles = await Promise.all(fileList.map(prepareUploadFile));
  const formData = new FormData();
  preparedFiles.forEach((file) => formData.append("files", file));

  let res: Response;
  try {
    res = await fetch(`${apiBase}/inbox/attachments/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
  } catch {
    throw new Error("Failed to upload image. Try a smaller image if this keeps happening.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 413) {
      throw new Error("Image is too large to upload. Try a smaller image.");
    }
    throw new Error(data?.error || data?.message || "Failed to upload attachment");
  }

  return Array.isArray(data?.attachments)
    ? data.attachments.map((attachment: Record<string, unknown>) => ({
        ...attachment,
        url: normalizeAttachmentUrl(apiBase, attachment.url as string | undefined),
      }))
    : [];
}

/** Rewrite an attachment URL to the current origin (handles `/api` base). */
function normalizeAttachmentUrl(apiBase: string, url?: string): string {
  if (!url) return "";
  const apiUrl = new URL(apiBase, window.location.origin);
  const mediaMarker = "/media/message-attachments/";
  const apiPrefix = apiUrl.pathname.replace(/\/$/, "") === "/api" ? "/api" : "";
  if (url.includes(mediaMarker)) {
    const storageKey = url.split(mediaMarker, 2)[1]?.split("?", 1)[0]?.split("#", 1)[0];
    if (storageKey) {
      return `${apiUrl.origin}${apiPrefix}${mediaMarker}${storageKey}`;
    }
  }
  if (/^https?:\/\//i.test(url)) return url;
  const prefix = apiUrl.pathname.replace(/\/$/, "") === "/api" && url.startsWith("/media/")
    ? "/api"
    : "";
  return `${apiUrl.origin}${prefix}${url.startsWith("/") ? url : `/${url}`}`;
}

export type AttachmentGalleryData = {
  attachments: UploadedAttachment[];
  total_bytes: number;
  count: number;
};

/** List the current user's uploaded attachments (for the gallery dropdown). */
export async function listMessageAttachments(
  apiBase: string,
  token: string,
): Promise<AttachmentGalleryData> {
  const res = await fetch(`${apiBase}/inbox/attachments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || "Failed to load gallery");
  }
  const attachments = Array.isArray(data?.attachments)
    ? data.attachments.map((attachment: UploadedAttachment) => ({
        ...attachment,
        url: normalizeAttachmentUrl(apiBase, attachment.url),
      }))
    : [];
  return {
    attachments,
    total_bytes: Number(data?.total_bytes) || 0,
    count: Number(data?.count) || attachments.length,
  };
}

/** Delete one of the current user's uploaded attachments by storage key. */
export async function deleteMessageAttachment(
  apiBase: string,
  token: string,
  storageKey: string,
): Promise<void> {
  const res = await fetch(
    `${apiBase}/inbox/attachments/${storageKey.split("/").map(encodeURIComponent).join("/")}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || data?.error || "Failed to delete attachment");
  }
}
