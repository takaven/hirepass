export type PassAccessLink = {
  isActive?: boolean | null;
  expiresAt?: Date | string | null;
};

export type PassAccessResult<T extends PassAccessLink> =
  | { allowed: true; link: T }
  | { allowed: false; status: 404 | 410; error: string };

export function resolvePassAccess<T extends PassAccessLink>(
  link: T | null | undefined,
  messages: { inactive: string; expired: string },
  now = new Date(),
): PassAccessResult<T> {
  if (!link || !link.isActive) {
    return { allowed: false, status: 404, error: messages.inactive };
  }

  if (link.expiresAt && new Date(link.expiresAt) < now) {
    return { allowed: false, status: 410, error: messages.expired };
  }

  return { allowed: true, link };
}
