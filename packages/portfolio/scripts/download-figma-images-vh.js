/**
 * Download Figma images for Vending Analytics and convert to WebP
 */

import sharp from 'sharp';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT_DIR, 'src', 'assets', 'images', 'projects', 'vending-analytics');

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

  const images = [
    {
      url: "https://www.figma.com/api/mcp/asset/164da441-45b4-4fa2-a6ac-143eecf3a65f",
      name: "desktop-view"
    },
    {
      url: "https://www.figma.com/api/mcp/asset/41ebeed6-b2df-453b-994e-a67a7ada767c",
      name: "mobile-screen-1"
    },
    {
      url: "https://www.figma.com/api/mcp/asset/9fae45eb-474b-4398-a2ad-40c27bdd2883",
      name: "mobile-screen-2"
    },
    {
      url: "https://www.figma.com/api/mcp/asset/74376b08-4922-441e-80f4-2c9f1a403e5f",
      name: "kellogg-icon"
    },
    {
      url: "https://www.figma.com/api/mcp/asset/2ffa9c25-d2df-4786-a8a5-9cc4c28f26f7",
      name: "lock-key"
    }
  ];

  console.log(`\n📥 Downloading ${images.length} images for Vending Analytics...\n`);

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
