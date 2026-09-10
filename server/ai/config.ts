export const AI_PROVIDER = "anthropic";
export const AI_PROMPT_VERSION = "candidate-review-v1";
export const AI_SCHEMA_VERSION = "candidate-review-schema-v1";
export const AI_REVIEW_RULE_VERSION = "review-band-v1";
export const AI_EXTRACTION_VERSION = "pdf-text-v1";
export const DEFAULT_AI_MODEL = "claude-sonnet-5";

export function isAiEnabled() {
  return process.env.HIREPASS_AI_ENABLED === "true";
}

export function getAiConfig() {
  const enabled = isAiEnabled();
  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  return {
    enabled,
    configured: enabled && Boolean(apiKey),
    provider: AI_PROVIDER,
    model: process.env.HIREPASS_AI_MODEL || DEFAULT_AI_MODEL,
    maxBatch: Math.max(1, Math.min(Number(process.env.HIREPASS_AI_MAX_BATCH || 25), 100)),
    timeoutMs: Math.max(5_000, Math.min(Number(process.env.HIREPASS_AI_TIMEOUT_MS || 30_000), 120_000)),
  };
}

export function aiStatus() {
  const config = getAiConfig();
  return {
    enabled: config.enabled,
    configured: config.configured,
    provider: config.provider,
    model: config.model,
    state: !config.enabled ? "disabled" : config.configured ? "configured" : "unavailable",
  };
}
