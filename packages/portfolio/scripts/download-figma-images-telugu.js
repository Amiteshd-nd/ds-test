/**
 * Download Figma images for Telugu Streaming and convert to WebP
 */

import sharp from 'sharp';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT_DIR, 'src', 'assets', 'images', 'projects', 'telugu-streaming');

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
      url: "https://www.figma.com/api/mcp/asset/9f2b4585-71e2-428d-a12d-0f9b4f7b2c7d",
      name: "home-selected"
    },
    {
      url: "https://www.figma.com/api/mcp/asset/660546a8-ad31-4225-8ac0-2c781d03dfbc",
      name: "mobile-homepage"
    },
    {
      url: "https://www.figma.com/api/mcp/asset/774cb82b-4e11-4a13-ba02-05a9387cc56f",
      name: "style-guide"
    },
    {
      url: "https://www.figma.com/api/mcp/asset/a07f777f-1ff6-460a-8cea-076611749594",
      name: "subscription-flow-1"
    },
    {
      url: "https://www.figma.com/api/mcp/asset/12b0c398-0a97-45e1-b68e-da987bc7250a",
      name: "subscription-flow-2"
    },
    {
      url: "https://www.figma.com/api/mcp/asset/76b292ed-47e8-490f-b838-deb8b6fa47e0",
      name: "subscription-workflow"
    },
    {
      url: "https://www.figma.com/api/mcp/asset/33200489-508e-47f6-9c4d-369b6bac27c0",
      name: "language-onboarding"
    },
    {
      url: "https://www.figma.com/api/mcp/asset/4cf270b3-4aff-4ed5-965b-2b1edb56868f",
      name: "content-4k-dolby"
    },
    {
      url: "https://www.figma.com/api/mcp/asset/d6f4c9c0-01b6-4f12-87f7-ca79845cddc4",
      name: "skip-song-player"
    },
    {
      url: "https://www.figma.com/api/mcp/asset/3902c804-5177-45ca-8eb2-ac098d4650b8",
      name: "quality-player"
    }
  ];

  console.log(`\n📥 Downloading ${images.length} images for Telugu Streaming...\n`);

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
