import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const AI_URL      = process.env.NEXT_PUBLIC_AI_URL      || 'http://localhost:8001';

async function ping(url: string, name: string) {
  try {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
    const data = await r.json().catch(() => ({}));
    return { name, status: r.ok ? 'ok' : 'error', code: r.status, ...data };
  } catch (e: any) {
    return { name, status: 'down', error: e.message };
  }
}

export async function GET() {
  const [backend, ai] = await Promise.all([
    ping(BACKEND_URL, 'backend'),
    ping(AI_URL,      'ai-service'),
  ]);
  const allOk = backend.status === 'ok' && ai.status === 'ok';
  return NextResponse.json({ ok: allOk, backend, ai }, { status: allOk ? 200 : 503 });
}
