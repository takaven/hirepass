export function getEmailConfig() {
  const enabled = process.env.HIREPASS_EMAIL_ENABLED === "true";
  const host = process.env.HIREPASS_SMTP_HOST || "";
  const port = Number(process.env.HIREPASS_SMTP_PORT || "587");
  const from = process.env.HIREPASS_EMAIL_FROM || "";
  const publicBaseUrl = normalizePublicBaseUrl(process.env.HIREPASS_PUBLIC_BASE_URL || "");
  const configured = enabled && Boolean(host && port && from && publicBaseUrl);
  return {
    enabled,
    configured,
    publicBaseUrl,
    host,
    port,
    secure: process.env.HIREPASS_SMTP_SECURE === "true",
    user: process.env.HIREPASS_SMTP_USER || "",
    password: process.env.HIREPASS_SMTP_PASSWORD || "",
    from,
  };
}

export function normalizePublicBaseUrl(value: string): string {
  if (!value.trim()) return "";
  try {
    const url = new URL(value);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") return "";
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function publicAppUrl(path: string): string | null {
  const base = getEmailConfig().publicBaseUrl;
  if (!base) return null;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}
