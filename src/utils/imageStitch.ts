// ============================================================================
// OpsV Image Stitch Utility
// Concatenates multiple images horizontally (--right) or vertically (--down).
// All images are scaled to match the smallest dimension before stitching.
// ============================================================================

import { Jimp } from 'jimp';

/**
 * Stitch multiple images into one.
 */
export async function stitchImages(
  inputs: string[],
  output: string,
  direction: 'right' | 'down',
): Promise<{ width: number; height: number; count: number }> {
  if (inputs.length < 2) {
    throw new Error('image-stitch requires at least 2 input images');
  }

  const images = [];
  for (const fp of inputs) {
    images.push(await Jimp.read(fp));
  }

  return direction === 'right'
    ? stitchHorizontal(images, output)
    : stitchVertical(images, output);
}

async function stitchHorizontal(
  images: any[],
  output: string,
): Promise<{ width: number; height: number; count: number }> {
  const minH = Math.min(...images.map((i: any) => i.bitmap.height));
  const scaled: any[] = [];

  for (const img of images) {
    if (img.bitmap.height === minH) {
      scaled.push(img);
    } else {
      const scale = minH / img.bitmap.height;
      img.resize({ w: Math.round(img.bitmap.width * scale), h: minH });
      scaled.push(img);
    }
  }

  const totalW = scaled.reduce((s: number, i: any) => s + i.bitmap.width, 0);
  const canvas = new Jimp({ width: totalW, height: minH, color: '#00000000' });

  let x = 0;
  for (const img of scaled) {
    canvas.composite(img, x, 0);
    x += img.bitmap.width;
  }

  await canvas.write(String(output) as `${string}.${string}`);
  return { width: totalW, height: minH, count: images.length };
}

async function stitchVertical(
  images: any[],
  output: string,
): Promise<{ width: number; height: number; count: number }> {
  const minW = Math.min(...images.map((i: any) => i.bitmap.width));
  const scaled: any[] = [];

  for (const img of images) {
    if (img.bitmap.width === minW) {
      scaled.push(img);
    } else {
      const scale = minW / img.bitmap.width;
      img.resize({ w: minW, h: Math.round(img.bitmap.height * scale) });
      scaled.push(img);
    }
  }

  const totalH = scaled.reduce((s: number, i: any) => s + i.bitmap.height, 0);
  const canvas = new Jimp({ width: minW, height: totalH, color: '#00000000' });

  let y = 0;
  for (const img of scaled) {
    canvas.composite(img, 0, y);
    y += img.bitmap.height;
  }

  await canvas.write(String(output) as `${string}.${string}`);
  return { width: minW, height: totalH, count: images.length };
}
