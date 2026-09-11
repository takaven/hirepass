export const DEFAULT_COMPANY_ACCENT_COLOR = "#01FF22";

const companyAccentPattern = /^#[0-9A-Fa-f]{6}$/;

export function sanitizeCompanyAccentColor(value: string | null | undefined): string | null {
  if (!value || !companyAccentPattern.test(value)) return null;
  return value.toUpperCase();
}

export function resolveCompanyAccentColor(value: string | null | undefined): string {
  return sanitizeCompanyAccentColor(value) ?? DEFAULT_COMPANY_ACCENT_COLOR;
}
