/**
 * Download Figma images and convert to WebP
 */

import sharp from 'sharp';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT_DIR, 'src', 'assets', 'images', 'projects', 'gazebo-complex-organisms');

async function downloadImage(url, outputPath) {
  try {
    console.log(`Downloading: ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Convert to WebP
    console.log(`Converting to WebP: ${outputPath}`);
    await sharp(buffer)
      .webp({ quality: 85, alphaQuality: 85 })
      .toFile(outputPath);

    console.log(`✓ Saved: ${outputPath}\n`);
    return true;
  } catch (error) {
    console.error(`✗ Error downloading ${url}:`, error.message);
    return false;
  }
}

async function main() {
  // Ensure output directory exists
  await mkdir(OUTPUT_DIR, { recursive: true });

  const images = JSON.parse(process.argv[2] || '[]');

  console.log(`\n📥 Downloading ${images.length} images...\n`);

  let success = 0;
  let failed = 0;

  for (const { url, name } of images) {
    const outputPath = join(OUTPUT_DIR, `${name}.webp`);
    const result = await downloadImage(url, outputPath);
    if (result) {
      success++;
    } else {
      failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary:');
  console.log(`   Success: ${success}`);
  console.log(`   Failed: ${failed}`);
}

main();
