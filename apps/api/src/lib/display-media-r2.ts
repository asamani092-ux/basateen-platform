import type { Env } from "../types";

/** الحد الأقصى لرفع الوسائط — 100 ميجابايت */
export const DISPLAY_MEDIA_MAX_BYTES = 100 * 1024 * 1024;

const PUBLIC_PATH_PREFIX = "/api/public/display-media/";

/** O(1) — قاعدة R2 العامة من البيئة */
export function resolveR2PublicBaseUrl(env: Env): string | null {
  const base = env.R2_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  return base || null;
}

/** O(1) — رفض تخزين base64 في D1 */
export function isDataUrl(url: string): boolean {
  return url.trim().toLowerCase().startsWith("data:");
}

export function isGoogleDriveUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u.includes("drive.google.com") || u.includes("docs.google.com/file");
}

/** O(n) على طول الرابط — استخراج معرّف ملف Drive */
export function extractGoogleDriveFileId(url: string): string | null {
  const trimmed = url.trim();
  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch?.[1]) return fileMatch[1];
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return idMatch?.[1] ?? null;
}

/** O(1) — رابط عرض مباشر لصورة Drive */
export function googleDriveImageDirectUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

export type MediaUrlNormalizeResult =
  | { ok: true; url: string }
  | { ok: false; error: string; code: string };

/**
 * O(n) — تطبيع رابط الوسائط: رفض data:/فيديو Drive، تحويل صورة Drive.
 * الزمن: O(n)؛ المكان: O(1).
 */
export function normalizeMediaSlideUrl(
  rawUrl: string,
  mediaType: string,
): MediaUrlNormalizeResult {
  const url = rawUrl.trim();
  if (!url) {
    return { ok: false, error: "media_url_required", code: "media_url_required" };
  }
  if (isDataUrl(url)) {
    return {
      ok: false,
      error: "يُمنع تخزين الوسائط كـ base64 — ارفع الملف أو ألصق رابطاً مباشراً.",
      code: "data_url_rejected",
    };
  }
  if (isGoogleDriveUrl(url)) {
    const fileId = extractGoogleDriveFileId(url);
    if (!fileId) {
      return {
        ok: false,
        error: "رابط Google Drive غير صالح.",
        code: "invalid_drive_url",
      };
    }
    if (mediaType === "video") {
      return {
        ok: false,
        error:
          "لا يمكن تشغيل فيديو من رابط Google Drive — يُرجى رفع ملف الفيديو مباشرة.",
        code: "drive_video_not_supported",
      };
    }
    return { ok: true, url: googleDriveImageDirectUrl(fileId) };
  }
  if (url.length > 2048) {
    return { ok: false, error: "media_url_too_long", code: "media_url_too_long" };
  }
  return { ok: true, url };
}

export function displayMediaPublicPath(key: string): string {
  return `${PUBLIC_PATH_PREFIX}${encodeURIComponent(key)}`;
}

/** O(1) — رابط مباشر من R2 pub عند توفر R2_PUBLIC_BASE_URL */
export function buildR2DirectPublicUrl(publicBase: string, key: string): string {
  const base = publicBase.replace(/\/$/, "");
  const segments = key.split("/").map((s) => encodeURIComponent(s));
  return `${base}/${segments.join("/")}`;
}

/**
 * O(1) — بناء رابط العرض: R2 pub مباشر إن وُجد، وإلا بروكسي الـ Worker.
 */
export function buildDisplayMediaPublicUrl(
  env: Env,
  request: Request,
  key: string,
): string {
  const r2Base = resolveR2PublicBaseUrl(env);
  if (r2Base) return buildR2DirectPublicUrl(r2Base, key);
  const origin = new URL(request.url).origin;
  return `${origin}${displayMediaPublicPath(key)}`;
}

/**
 * O(n) — استخراج مفتاح R2 من رابط العرض (Worker أو pub.r2.dev).
 */
export function extractR2KeyFromPublicUrl(url: string, r2PublicBase?: string | null): string | null {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    const pathKey = decodeURIComponent(parsed.pathname.replace(/^\//, ""));

    if (r2PublicBase) {
      const base = r2PublicBase.replace(/\/$/, "");
      if (trimmed.startsWith(`${base}/`) && pathKey.startsWith("display/")) {
        return pathKey;
      }
    }

    if (parsed.hostname.endsWith(".r2.dev") && pathKey.startsWith("display/")) {
      return pathKey;
    }

    if (parsed.pathname.startsWith(PUBLIC_PATH_PREFIX)) {
      const encoded = parsed.pathname.slice(PUBLIC_PATH_PREFIX.length);
      return decodeURIComponent(encoded);
    }
  } catch {
    if (trimmed.startsWith(PUBLIC_PATH_PREFIX)) {
      return decodeURIComponent(trimmed.slice(PUBLIC_PATH_PREFIX.length));
    }
  }
  return null;
}

export function r2Available(env: Env): env is Env & { DISPLAY_MEDIA: R2Bucket } {
  return "DISPLAY_MEDIA" in env && env.DISPLAY_MEDIA != null;
}

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("gif")) return "gif";
  if (m.includes("webp")) return "webp";
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("webm")) return "webm";
  if (m.startsWith("video/")) return "mp4";
  if (m.startsWith("image/")) return "jpg";
  return "bin";
}

function mediaTypeFromMime(mime: string): "image" | "gif" | "video" {
  const m = mime.toLowerCase();
  if (m.includes("gif")) return "gif";
  if (m.startsWith("video/")) return "video";
  return "image";
}

function randomKeyPart(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildR2ObjectKey(complexId: number, mime: string): string {
  return `display/c${complexId}/${Date.now()}-${randomKeyPart()}.${extFromMime(mime)}`;
}

/** O(1) I/O — رفع تدفق إلى R2 */
export async function putDisplayMediaObject(
  env: Env,
  key: string,
  body: ReadableStream | ArrayBuffer | ArrayBufferView,
  contentType: string,
): Promise<void> {
  if (!r2Available(env)) throw new Error("r2_not_configured");
  await env.DISPLAY_MEDIA.put(key, body, {
    httpMetadata: { contentType },
  });
}

/** O(1) — حذف كائن R2 إن وُجد مفتاح في الرابط */
export async function deleteDisplayMediaR2ByUrl(env: Env, mediaUrl: string): Promise<boolean> {
  if (!r2Available(env)) return false;
  const key = extractR2KeyFromPublicUrl(mediaUrl, resolveR2PublicBaseUrl(env));
  if (!key) return false;
  await env.DISPLAY_MEDIA.delete(key);
  return true;
}

export type DisplayMediaUploadResult = {
  url: string;
  media_type: "image" | "gif" | "video";
  r2_key: string;
};

/**
 * O(1) تدفق — رفع ملف multipart إلى R2 وإرجاع رابط العرض.
 * الزمن: O(B) حيث B حجم الملف؛ المكان: O(1) بافر التدفق.
 */
export async function uploadDisplayMediaFile(
  env: Env,
  request: Request,
  complexId: number,
  file: { size: number; type: string; stream: () => ReadableStream },
): Promise<DisplayMediaUploadResult> {
  if (!r2Available(env)) throw new Error("r2_not_configured");
  if (file.size > DISPLAY_MEDIA_MAX_BYTES) throw new Error("file_too_large");
  const mime = (file.type || "application/octet-stream").toLowerCase();
  if (!mime.startsWith("image/") && !mime.startsWith("video/")) {
    throw new Error("invalid_content_type");
  }

  const key = buildR2ObjectKey(complexId, mime);
  await putDisplayMediaObject(env, key, file.stream(), mime);
  const url = buildDisplayMediaPublicUrl(env, request, key);
  return { url, media_type: mediaTypeFromMime(mime), r2_key: key };
}

/** O(1) — فك ترميز data URL إلى بايتات */
export function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const m = dataUrl.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/i);
  if (!m) return null;
  const mime = (m[1] || "application/octet-stream").toLowerCase();
  const payload = m[2];
  try {
    if (dataUrl.includes(";base64,")) {
      const bin = atob(payload);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { bytes, mime };
    }
    const decoded = decodeURIComponent(payload);
    const bytes = new TextEncoder().encode(decoded);
    return { bytes, mime };
  } catch {
    return null;
  }
}

/** O(B) — رفع بايتات من data URL إلى R2 (ترحيل لمرة واحدة) */
export async function uploadDataUrlToR2(
  env: Env,
  request: Request,
  complexId: number,
  dataUrl: string,
): Promise<DisplayMediaUploadResult | null> {
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) return null;
  if (!decoded.mime.startsWith("image/") && !decoded.mime.startsWith("video/")) {
    return null;
  }
  const key = buildR2ObjectKey(complexId, decoded.mime);
  await putDisplayMediaObject(env, key, decoded.bytes, decoded.mime);
  const url = buildDisplayMediaPublicUrl(env, request, key);
  return { url, media_type: mediaTypeFromMime(decoded.mime), r2_key: key };
}

/** O(1) — بناء رابط عام لسكربت الترحيل (بدون Request) */
export function buildDisplayMediaPublicUrlForMigration(
  publicBase: string | null,
  apiOrigin: string,
  key: string,
): string {
  if (publicBase) return buildR2DirectPublicUrl(publicBase, key);
  return `${apiOrigin.replace(/\/$/, "")}${displayMediaPublicPath(key)}`;
}
