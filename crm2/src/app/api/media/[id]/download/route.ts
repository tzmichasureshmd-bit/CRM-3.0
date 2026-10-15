import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/flows/admin-client";

type Params = { id: string };

// GET /api/media/:id/download
//
// Proxies a media asset stored in Supabase Storage so that every download
// is account-gated by the authenticated session (RLS on media_assets +
// service-role storage read), avoiding blanket public_url access.
//
// If the asset is an image/video/audio and the browser supports inline
// rendering, Content-Disposition is set to `inline`; otherwise
// `attachment` triggers a download prompt — matching the expectation
// that documents save to disk while media can be previewed in-tab.
//
// Query params:
//   ?download=1   Force Content-Disposition: attachment even for media.
//
// Returns 302 to a short-lived signed storage URL. Returns 404 on a
// missing/unresolved asset. A HEAD probe returns the same headers
// without the body.

export async function HEAD(
  req: Request,
  { params }: { params: Promise<Params> },
) {
  return handleDownload(req, params, true);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<Params> },
) {
  return handleDownload(req, params, false);
}

async function handleDownload(
  req: Request,
  paramsPromise: Promise<Params>,
  headOnly: boolean,
) {
  let ctx;
  try {
    ctx = await requireRole("viewer");
  } catch (err) {
    return toErrorResponse(err);
  }

  const { accountId, supabase } = ctx;

  const params = await paramsPromise;

  // Fetch the registry row through the authenticated client (RLS gates on
  // account_id, so a different account's row returns zero rows).
  const { data: asset, error: fetchErr } = await supabase
    .from("media_assets")
    .select("id, bucket, path, public_url, file_name, mime_type, size_bytes, kind")
    .eq("id", params.id)
    .eq("account_id", accountId)
    .maybeSingle();

  if (fetchErr || !asset) {
    return NextResponse.json(
      { error: "Media not found." },
      { status: 404 },
    );
  }

  // Use the service-role admin client to issue a signed download URL
  // so the browser fetches the actual bytes. Works identically for
  // public and private buckets, and is time-limited (60 s).
  const admin = supabaseAdmin();

  const { data: signed, error: signErr } = await admin.storage
    .from(asset.bucket)
    .createSignedUrl(asset.path, 60);

  if (signErr || !signed?.signedUrl) {
    // Last resort: if it's a public bucket, return public_url with
    // cache headers and let the browser handle the redirect.
    if (asset.public_url) {
      return new Response(null, {
        status: 302,
        headers: { Location: asset.public_url },
      });
    }
    return NextResponse.json(
      { error: "Could not resolve download URL." },
      { status: 500 },
    );
  }

  const forceDownload =
    new URL(req.url).searchParams.get("download") === "1";

  const isInlineMedia =
    asset.kind === "image" || asset.kind === "video" || asset.kind === "audio";
  const contentDisposition =
    !forceDownload &&
    (headOnly || isInlineMedia)
      ? "inline"
      : `attachment; filename="${asset.file_name.replace(/"/g, '\\"')}"`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: signed.signedUrl,
      "Content-Type": asset.mime_type || "application/octet-stream",
      "Content-Length": String(asset.size_bytes || 0),
      "Content-Disposition": contentDisposition,
      "Cache-Control": "private, max-age=300",
    },
  });
}