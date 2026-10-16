import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

async function proxy(req: NextRequest, path: string) {
  const url = new URL(req.url);

  // Route: /api/v3/instagram/settings/integrations/instagram → /api/v1/settings/integrations/instagram
  // Route: /api/v3/instagram/status → /api/v1/instagram/status
  // Route: /api/v3/instagram/profile → /api/v1/instagram/profile
  let target: string;
  if (path.startsWith('settings/')) {
    target = `${BACKEND}/api/v1/${path}${url.search}`;
  } else {
    target = `${BACKEND}/api/v1/instagram/${path}${url.search}`;
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = req.headers.get('authorization');
  if (auth) headers['Authorization'] = auth;

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.text();
  }

  try {
    const res = await fetch(target, init);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 503 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, (path ?? []).join('/'));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, (path ?? []).join('/'));
}
