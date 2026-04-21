import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  if (pathname === '/admin/login') {
    return NextResponse.next();
  }

  const hasAdminCookie = Boolean(request.cookies.get('admin_auth')?.value);
  if (hasAdminCookie) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/admin/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export function proxy(request: NextRequest) {
  return middleware(request);
}

export const config = {
  matcher: ['/admin/:path*'],
};
