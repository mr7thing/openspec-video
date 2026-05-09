import crypto from 'crypto';

/**
 * Generate a random natural number less than 10^16.
 * Used for seed values when 'random' is specified in node mapping.
 */
export function generateRandomSeed(): number {
  const max = 10_000_000_000_000_000; // 10^16
  const buf = crypto.randomBytes(8);
  let num = 0;
  for (let i = 0; i < 8; i++) {
    num = num * 256 + buf[i];
  }
  return num % max;
}
