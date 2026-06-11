#!/usr/bin/env node
// ============================================================================
// merge_characters.mjs — 将多个角色图合并为一张并稿图
// 用于分镜生图前的预处理：场景 + 角色合成工作流需要单张角色参考图
// ============================================================================
// 用法:
//   node merge_characters.mjs --output merged.png char1.png char2.png char3.png
//   node merge_characters.mjs --output merged.png --layout horizontal --gap 8 a.png b.png
// ============================================================================

import { Jimp } from 'jimp';
import { parseArgs } from 'node:util';
import path from 'node:path';

// --- CLI 参数解析 ---
const { values, positionals } = parseArgs({
  options: {
    output:   { type: 'string', short: 'o' },
    layout:   { type: 'string', short: 'l', default: 'horizontal' },
    gap:      { type: 'string', short: 'g', default: '8' },
    maxWidth: { type: 'string', default: '2048' },
    help:     { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
});

if (values.help || positionals.length === 0) {
  console.log(`
Usage: node merge_characters.mjs [options] <char1.png> [char2.png ...]

Options:
  -o, --output <path>    Output file path (default: merged_characters.png)
  -l, --layout <layout>  horizontal (default) | vertical | grid
  -g, --gap <px>         Gap between images in pixels (default: 8)
  --maxWidth <px>        Max total width before wrapping (default: 2048)
  -h, --help             Show this help

Example:
  node merge_characters.mjs --output merged.png lu_ran.png yun_li.png
`);
  process.exit(0);
}

const inputPaths = positionals;
const outputPath = values.output || 'merged_characters.png';
const layout = values.layout || 'horizontal';
const gap = parseInt(values.gap || '8', 10) || 0;
const maxWidth = parseInt(values.maxWidth || '2048', 10);

// --- 加载所有输入图片 ---
console.log(`[merge_characters] 加载 ${inputPaths.length} 张角色图...`);
const images = [];
for (const imgPath of inputPaths) {
  try {
    const img = await Jimp.read(imgPath);
    images.push({ img, name: path.basename(imgPath) });
    console.log(`  ✓ ${path.basename(imgPath)} (${img.bitmap.width}x${img.bitmap.height})`);
  } catch (err) {
    console.error(`  ✗ ${path.basename(imgPath)}: ${err.message}`);
    process.exit(1);
  }
}

if (images.length === 0) {
  console.error('[merge_characters] 没有有效输入图片');
  process.exit(1);
}

if (images.length === 1) {
  // 单张图直接复制输出（仍做格式归一化）
  console.log('[merge_characters] 单张图，直接输出');
  await images[0].img.write(outputPath);
  console.log(`[merge_characters] ✓ 输出: ${outputPath}`);
  process.exit(0);
}

// --- 布局计算 ---
const targetHeight = Math.max(...images.map(i => i.img.bitmap.height));
const totalRawWidth = images.reduce((sum, i) => sum + i.img.bitmap.width, 0) + gap * (images.length - 1);

let cols, rows, canvasWidth, canvasHeight;

if (layout === 'vertical') {
  cols = 1;
  rows = images.length;
  canvasWidth = Math.max(...images.map(i => i.img.bitmap.width));
  canvasHeight = images.reduce((sum, i) => sum + i.img.bitmap.height, 0) + gap * (images.length - 1);
} else if (layout === 'grid') {
  // 自动计算接近正方形的网格
  cols = Math.ceil(Math.sqrt(images.length));
  rows = Math.ceil(images.length / cols);
  const maxW = Math.max(...images.map(i => i.img.bitmap.width));
  const maxH = Math.max(...images.map(i => i.img.bitmap.height));
  canvasWidth = cols * maxW + gap * (cols - 1);
  canvasHeight = rows * maxH + gap * (rows - 1);
  // 统一缩放到统一尺寸以便网格对齐
  for (const item of images) {
    const scale = Math.min(maxW / item.img.bitmap.width, maxH / item.img.bitmap.height);
    item.img.resize({ w: Math.round(item.img.bitmap.width * scale), h: Math.round(item.img.bitmap.height * scale) });
  }
} else {
  // horizontal: 一行排开
  if (totalRawWidth <= maxWidth) {
    // 一行够放
    cols = images.length;
    rows = 1;
    canvasWidth = totalRawWidth;
    canvasHeight = targetHeight;
  } else {
    // 需要换行
    cols = Math.min(images.length, Math.floor(maxWidth / (Math.max(...images.map(i => i.img.bitmap.width)) + gap)));
    if (cols < 1) cols = 1;
    rows = Math.ceil(images.length / cols);
    const maxW = Math.max(...images.map(i => i.img.bitmap.width));
    canvasWidth = cols * maxW + gap * (cols - 1);
    canvasHeight = rows * targetHeight + gap * (rows - 1);
    // 统一缩放到 targetHeight
    for (const item of images) {
      if (item.img.bitmap.height !== targetHeight) {
        const scale = targetHeight / item.img.bitmap.height;
        item.img.resize({ w: Math.round(item.img.bitmap.width * scale), h: targetHeight });
      }
    }
  }
}

console.log(`[merge_characters] 画布: ${canvasWidth}x${canvasHeight}, 布局: ${cols}x${rows}`);

// --- 合成 ---
const canvas = new Jimp({ width: canvasWidth, height: canvasHeight, color: '#00000000' });

let x = 0, y = 0;
for (let i = 0; i < images.length; i++) {
  const { img } = images[i];
  // 居中放置
  const offsetY = Math.floor((targetHeight - img.bitmap.height) / 2);
  canvas.composite(img, x, offsetY > 0 ? offsetY : 0);
  
  x += img.bitmap.width + gap;
  if (layout !== 'vertical' && x + (img.bitmap.width || 0) > canvasWidth && i < images.length - 1) {
    // 换行
    x = 0;
    y += targetHeight + gap;
  }
}

// --- 输出 ---
await canvas.write(outputPath);
console.log(`[merge_characters] ✓ 输出: ${outputPath} (${canvasWidth}x${canvasHeight})`);
