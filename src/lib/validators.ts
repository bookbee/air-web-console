/**
 * Parsing optional JSON out of a textarea. Ported from `state.py`'s
 * `parse_json_object`.
 */

export interface JsonParseResult<T> {
  value: T | null;
  error: string | null;
}

/** Parse an optional JSON object from a textarea. A blank string means
 * "omit this field" — the request schemas set `additionalProperties: false`
 * and reject stray or malformed keys outright, so absence has to stay
 * distinguishable from `{}`. */
export function parseJsonObject(raw: string, label: string): JsonParseResult<Record<string, unknown>> {
  if (!raw.trim()) return { value: null, error: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    return { value: null, error: `${label} is not valid JSON: ${message}` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { value: null, error: `${label} must be a JSON object.` };
  }
  return { value: parsed as Record<string, unknown>, error: null };
}

/** Parse an optional JSON array from a textarea, same absence semantics. */
export function parseJsonArray<T = unknown>(raw: string, label: string): JsonParseResult<T[]> {
  if (!raw.trim()) return { value: null, error: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    return { value: null, error: `${label} is not valid JSON: ${message}` };
  }
  if (!Array.isArray(parsed)) {
    return { value: null, error: `${label} must be a JSON array.` };
  }
  return { value: parsed as T[], error: null };
}
