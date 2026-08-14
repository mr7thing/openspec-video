import crypto from 'crypto';

/**
 * Serialize a semantic value with recursively sorted object keys.
 * Array order is intentionally preserved because it is part of the contract.
 */
export function canonicalJson(value: unknown): string {
  const serialized = JSON.stringify(normalizeCanonicalValue(value));
  if (serialized === undefined) {
    throw new TypeError('Canonical JSON root must be serializable');
  }
  return serialized;
}

export function canonicalDigest(
  value: unknown,
  schemaId = 'canonical-json',
  version = 1,
): string {
  const preimage = `opsv:${schemaId}:v${version}\n${canonicalJson(value)}`;
  return `sha256:${crypto.createHash('sha256').update(preimage, 'utf8').digest('hex')}`;
}

function normalizeCanonicalValue(value: unknown): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('Canonical JSON numbers must be finite');
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeCanonicalValue(item));
  }

  if (value && typeof value === 'object') {
    if (value instanceof Date) return value.toJSON();

    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol') continue;
      normalized[key] = normalizeCanonicalValue(item);
    }
    return normalized;
  }

  return value;
}
