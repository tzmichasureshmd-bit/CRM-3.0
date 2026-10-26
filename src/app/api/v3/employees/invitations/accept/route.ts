import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const r = await fetch(`${BACKEND}/api/v1/employees/invitations/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
