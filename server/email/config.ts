export function getEmailConfig() {
  const enabled = process.env.HIREPASS_EMAIL_ENABLED === "true";
  const host = process.env.HIREPASS_SMTP_HOST || "";
  const port = Number(process.env.HIREPASS_SMTP_PORT || "587");
  const from = process.env.HIREPASS_EMAIL_FROM || "";
  const configured = enabled && Boolean(host && port && from);
  return {
    enabled,
    configured,
    host,
    port,
    secure: process.env.HIREPASS_SMTP_SECURE === "true",
    user: process.env.HIREPASS_SMTP_USER || "",
    password: process.env.HIREPASS_SMTP_PASSWORD || "",
    from,
  };
}

