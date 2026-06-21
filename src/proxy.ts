import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/**
 * Proxy (ex-middleware en Next 16). Chequeo barato de PRESENCIA de la cookie de
 * sesión. La verificación real de la firma (HMAC) se hace en runtime Node dentro
 * de las páginas/route handlers (getSession). Si la cookie es inválida, la página
 * redirige igual a /login.
 */
export function proxy(req: NextRequest) {
  const hasCookie = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (!hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Protege todo salvo /login, las rutas de auth, y assets de Next.
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
