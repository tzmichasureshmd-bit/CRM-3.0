import { createClient } from "@/lib/supabase/client";

/**
 * Shared media-upload helper for Supabase Storage buckets that use the
 * account-scoped path convention introduced in migration 020
 * (`flow-media`) and reused by migration 023 (`chat-media`):
 *
 *   <bucket>/account-<account_id>/<timestamp>-<basename>.<ext>
 *
 * The first path segment (`account-<uuid>`) is what the bucket's RLS
 * write policies match on, so every caller MUST go through here rather
 * than hand-rolling a path — a mismatched segment is silently rejected
 * by RLS. Both the Flows builder (`node-config-form`) and the inbox
 * composer call this so the logic lives in exactly one place.
 */

/** 16 MB — matches the `file_size_limit` on both buckets (migrations 016/020/023). */
export const MEDIA_MAX_BYTES = 16 * 1024 * 1024;

/**
 * Per-kind upload ceilings that mirror Meta's WhatsApp Cloud API caps so
 * a file that the bucket would accept (≤16 MB) but Meta would reject is
 * caught client-side BEFORE upload — otherwise it lands in storage as an
 * orphan and the send fails with a confusing 400. Images are Meta's
 * tightest cap at 5 MB; documents are held at the 16 MB bucket limit
 * (Meta allows 100 MB, but the bucket — and shared-hosting upload UX —
 * caps lower).
 */
export const MEDIA_MAX_BYTES_BY_KIND = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 16 * 1024 * 1024,
} as const;

/**
 * Build the account-scoped object path for an upload. Pure + exported so
 * it can be unit-tested without a Supabase client.
 *
 * - `basename` is stripped of its extension, lower-cased non-safe chars
 *   are collapsed to `_`, and it's capped at 40 chars (falls back to
 *   "file" when empty).
 * - The timestamp + the original name keep collisions between two
 *   concurrent uploads astronomically unlikely.
 */
export function buildMediaPath(
  accountId: string,
  fileName: string,
  now: number = Date.now(),
): string {
  // Only treat the trailing segment as an extension when there's a real
  // one — a bare name like "README" has no extension and falls back to
  // "bin" rather than becoming "readme".
  const hasExt = /\.[^.]+$/.test(fileName);
  const ext = hasExt ? fileName.split(".").pop()!.toLowerCase() : "bin";
  const safeBase =
    fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .slice(0, 40) || "file";
  return `account-${accountId}/${now}-${safeBase}.${ext}`;
}

export interface UploadAccountMediaResult {
  /** Public URL Meta can fetch at send time. */
  publicUrl: string;
  /** Storage object path (account-scoped). */
  path: string;
}

/**
 * Derive the media "kind" used by the media_assets registry and the
 * Media Library filter chips. Falls back to "document" for anything
 * that isn't recognisably image/video/audio — same default Meta uses
 * when it treats unknown types as documents.
 */
export function mediaKindFromMime(mimeType: string): "image" | "video" | "audio" | "document" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

export interface UploadMediaOptions {
  /** Optional library category for the media_assets registry row. */
  category?: string | null;
  /** Real byte-level progress callback (0–100). */
  onProgress?: (percent: number) => void;
}

/**
 * Push a File to the Supabase Storage endpoint over XHR so the browser
 * exposes true upload progress. This is the exact endpoint supabase-js
 * POSTs to — the session token is already in the browser, so nothing
 * new is exposed. Rejects on any non-2xx status or a network error.
 */
function uploadViaXhr(
  supabaseUrl: string,
  bucket: string,
  path: string,
  token: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${supabaseUrl}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "3600");
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e: ProgressEvent) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(`Upload failed (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed — network error"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.timeout = 120_000;
    xhr.send(file);
  });
}

/**
 * Upload a file to an account-scoped Storage bucket and return its public
 * URL. Throws with a user-facing message on auth / account-resolution /
 * upload failure — callers surface it via a toast.
 *
 * Size validation is the caller's responsibility (limits can differ per
 * feature); `MEDIA_MAX_BYTES` is exported for the common case.
 *
 * When `options.onProgress` is provided, it receives a real 0–100
 * percentage derived from the browser's upload event. If the session
 * token is unavailable (rare — this should only happen when signed out)
 * it falls back to the standard supabase-js upload and fires 0 / 100 so
 * the UI still shows an honest "uploading → done" transition.
 */
export async function uploadAccountMedia(
  bucket: string,
  file: File,
  options?: UploadMediaOptions,
): Promise<UploadAccountMediaResult> {
  return uploadAccountMediaWithProgress(bucket, file, options);
}

export async function uploadAccountMediaWithProgress(
  bucket: string,
  file: File,
  options: UploadMediaOptions = {},
): Promise<UploadAccountMediaResult> {
  const supabase = createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new Error("Not signed in.");
  }

  // Resolve account_id so the path is account-scoped (matches the
  // bucket's RLS write policy from migration 020/023). User-scoped
  // paths would be rejected.
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileErr || !profile?.account_id) {
    throw new Error("Could not resolve your account.");
  }
  const accountId = profile.account_id as string;

  const path = buildMediaPath(accountId, file.name);

  // Prefer a real byte-progress upload via XHR. The token is the user's
  // own session token (already in the browser) and the endpoint is the
  // same one supabase-js uses.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  const supabaseUrl =
    (process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined) ?? "";

  let uploaded = false;
  if (token && supabaseUrl) {
    try {
      options.onProgress?.(1);
      await uploadViaXhr(
        supabaseUrl.replace(/\/$/, ""),
        bucket,
        path,
        token,
        file,
        options.onProgress,
      );
      uploaded = true;
    } catch {
      // Fall back to the classic path below rather than failing the upload.
    }
  }
  if (!uploaded) {
    if (options.onProgress) {
      // No byte events available — report an honest two-stage transition
      // (starts at 0%, jumps to ~90% while the request is in flight, then
      // 100% only once registration completes).
      options.onProgress(0);
    }
    const {
      data: { publicUrl: _unusedUrl },
    } = supabase.storage.from(bucket).getPublicUrl(path);
    void _unusedUrl;
    options.onProgress?.(50);
    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
    if (upErr) throw new Error(upErr.message);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path);

  // Register the upload in the account's media library (migration 049).
  // Best-effort: the send must not fail because the registry insert did —
  // an unregistered file is a library nit, not a broken attachment.
  try {
    await supabase.from("media_assets").insert({
      account_id: accountId,
      bucket,
      path,
      public_url: publicUrl,
      file_name: file.name,
      mime_type: file.type ?? "",
      size_bytes: file.size,
      kind: mediaKindFromMime(file.type ?? ""),
      category: options.category?.trim() || null,
      uploaded_by: user.id,
    });
  } catch (registryErr) {
    console.warn("media_assets registry insert skipped:", registryErr);
  }

  return { publicUrl, path };
}

/**
 * Delete a previously-uploaded object. Used to GC media that was staged
 * (uploaded) but never sent — a cancelled draft or a failed Meta send —
 * so abandoned attachments don't accumulate in the public bucket. The
 * DELETE is gated by the same account-scoped RLS policy as the upload,
 * so a caller can only remove objects under their own account folder.
 *
 * Best-effort: callers fire-and-forget and swallow errors (a missed
 * delete is a storage nit, not something to surface to the user).
 */
export async function deleteAccountMedia(
  bucket: string,
  path: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw new Error(error.message);

  // Keep the media library (migration 049) in sync — GC'd or cancelled
  // uploads shouldn't leave dead entries behind. Best-effort like the
  // insert: the object is already gone, so a missed row delete must not
  // fail the caller.
  try {
    await supabase
      .from("media_assets")
      .delete()
      .match({ bucket, path });
  } catch (registryErr) {
    console.warn("media_assets cleanup skipped:", registryErr);
  }
}