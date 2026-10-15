import { NextRequest, NextResponse } from 'next/server';

// Root redirect — all other route protection is handled client-side in layout.tsx
export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/'],
};
