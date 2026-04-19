// @ts-nocheck
import { NextResponse } from 'next/server';

function clearCookie(res: NextResponse) {
  res.cookies.set({ name: 'mc_auth', value: '', httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 0 });
  return res;
}

export async function GET() {
  const res = NextResponse.redirect(new URL('https://mission.effectx.com.au/login'));
  return clearCookie(res);
}

export async function POST() {
  const res = NextResponse.json({ ok: true });
  return clearCookie(res);
}
