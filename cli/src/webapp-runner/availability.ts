// ============================================================================
// OpsV Webapp Provider Availability Notice
//
// The webapp provider (Gemini browser automation) is TEMPORARILY UNAVAILABLE:
// the reference-image upload path is broken at HEAD. All three in-page upload
// strategies fail against current Gemini (isolated-world vs main-world issue),
// and migration to CDP/OpenCLI trusted input is still in progress.
//
// Background: extension/docs/gemini-upload-mechanism.md
// Remove this notice once the CDP/OpenCLI upload path lands.
// ============================================================================

import chalk from 'chalk';
import { logger } from '../utils/logger';

export const WEBAPP_UNAVAILABLE_NOTICE =
  '[webapp] TEMPORARILY UNAVAILABLE: the Gemini reference-image upload path is broken ' +
  '(see extension/docs/gemini-upload-mechanism.md). Migration to CDP/OpenCLI trusted ' +
  'input is in progress. Tasks will still run, but reference-image uploads are expected to fail.';

let warned = false;

/**
 * Print the unavailability warning once per process (console + winston).
 */
export function warnWebappUnavailable(): void {
  if (warned) return;
  warned = true;
  console.log(chalk.yellow(WEBAPP_UNAVAILABLE_NOTICE));
  logger.warn(WEBAPP_UNAVAILABLE_NOTICE);
}
