/** بناء رابط شاشة التلفاز — مفتاح تشغيل بدون اشتراط login */
export function buildTvLaunchUrl(launchKey: string, sessionId?: number): string {
  const params = new URLSearchParams({ key: launchKey });
  if (sessionId != null) params.set("session", String(sessionId));
  return `/tv-live?${params.toString()}`;
}

export function parseTvQuery(search: string): {
  key: string | null;
  sessionId: number | null;
} {
  const params = new URLSearchParams(search);
  const key = params.get("key");
  const session = params.get("session");
  return {
    key,
    sessionId: session ? Number(session) : null,
  };
}
