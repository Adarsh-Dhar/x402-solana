import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public routes that don't require authentication
  const publicRoutes = ["/login", "/api/auth", "/api/stake", "/api/auth/register", "/api/auth/check-staking", "/api/v1/tasks", "/api/v1/agent-sessions"]
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route))

  // If accessing a public route, allow it
  if (isPublicRoute) {
    return NextResponse.next()
  }

  // Check for session cookie (simplified auth check for Edge Runtime)
  const sessionToken = request.cookies.get("next-auth.session-token") || request.cookies.get("__Secure-next-auth.session-token")
  
  // If not authenticated and trying to access protected route, redirect to login
  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}

// Explicitly use Edge Runtime
export const runtime = 'edge'

