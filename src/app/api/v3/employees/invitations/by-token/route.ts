import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token') ?? '';
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });
  try {
    const r = await fetch(`${BACKEND}/api/v1/employees/invitations/by-token?token=${encodeURIComponent(token)}`);
    if (!r.ok) return NextResponse.json({ error: 'Not found' }, { status: r.status });
    return NextResponse.json(await r.json());
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
