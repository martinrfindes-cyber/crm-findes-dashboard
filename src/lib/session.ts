import "server-only";
import crypto from "node:crypto";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "./session-cookie";

export { SESSION_COOKIE, SESSION_MAX_AGE };
const MAX_AGE_SECONDS = SESSION_MAX_AGE;

export type SessionPayload = {
  username: string;
  name: string;
  exp: number; // epoch segundos
};

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET no está definida");
  return secret;
}

function sign(data: string): string {
  return crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
}

/** Crea un token firmado: base64url(payload).firma */
export function createSessionToken(input: { username: string; name: string }): string {
  const payload: SessionPayload = {
    username: input.username,
    name: input.name,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Verifica firma + expiración. Devuelve el payload o null. */
export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = sign(body);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
