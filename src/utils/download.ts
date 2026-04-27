// ============================================================================
// OpsV v0.8 Download Utility
// ============================================================================

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { logger } from './logger';
import { ErrorFactory } from '../errors/OpsVError';

export interface DownloadOptions {
  timeout?: number;
  headers?: Record<string, string>;
}

export async function downloadFile(
  url: string,
  outputFilePath: string,
  options: DownloadOptions = {}
): Promise<string> {
  const dir = path.dirname(outputFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = outputFilePath + '.tmp';

  try {
    const response = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      timeout: options.timeout || 120000,
      headers: options.headers,
    });

    const writer = fs.createWriteStream(tmpPath);
    await new Promise<void>((resolve, reject) => {
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    fs.renameSync(tmpPath, outputFilePath);
    logger.debug(`Downloaded: ${url} → ${outputFilePath}`);
    return outputFilePath;
  } catch (e: any) {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    throw ErrorFactory.apiError('download', e.message);
  }
}
