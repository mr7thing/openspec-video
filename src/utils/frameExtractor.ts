// ============================================================================
// OpsV v0.8 Frame Extractor
// ============================================================================

import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import { OpsVErrorCode } from '../errors/OpsVError';

const execPromise = util.promisify(exec);

export class FrameExtractor {
  static async extractLastFrame(videoPath: string, outputPath: string): Promise<string> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const cmd = `ffmpeg -y -sseof -3 -i "${videoPath}" -update 1 -q:v 2 "${outputPath}"`;

    try {
      await execPromise(cmd);
      return outputPath;
    } catch (error: any) {
      throw new Error(
        `Frame extraction failed: ${error.message}. Ensure ffmpeg is installed and in PATH.`
      );
    }
  }

  static async extractFirstFrame(videoPath: string, outputPath: string): Promise<string> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const cmd = `ffmpeg -y -i "${videoPath}" -frames:v 1 -q:v 2 "${outputPath}"`;

    try {
      await execPromise(cmd);
      return outputPath;
    } catch (error: any) {
      throw new Error(
        `Frame extraction failed: ${error.message}. Ensure ffmpeg is installed and in PATH.`
      );
    }
  }
}
