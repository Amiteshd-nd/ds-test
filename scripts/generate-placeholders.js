/**
 * Placeholder Image Generation Script
 *
 * Generates tiny blurred placeholder images (20px wide, < 1KB) for progressive loading.
 * Run with: node scripts/generate-placeholders.js
 */

import sharp from 'sharp';
import { readdir, stat } from 'fs/promises';
import { join, extname, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const IMAGES_DIR = join(ROOT_DIR, 'src', 'assets', 'images');

// Placeholder settings
const PLACEHOLDER_WIDTH = 20;
const PLACEHOLDER_QUALITY = 20;

// Supported input formats
const SUPPORTED_FORMATS = ['.png', '.jpg', '.jpeg'];

// Stats tracking
let processed = 0;
let skipped = 0;
let errors = 0;
let totalSize = 0;

async function getAllImages(dir) {
  const files = [];

  async function walk(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        // Skip already generated placeholders
        if (SUPPORTED_FORMATS.includes(ext) && !entry.name.includes('-placeholder')) {
          files.push(fullPath);
        }
      }
    }
  }

  await walk(dir);
  return files;
}

async function generatePlaceholder(imagePath) {
  const ext = extname(imagePath).toLowerCase();
  const baseName = basename(imagePath, ext);
  const imageDir = dirname(imagePath);

  try {
    // Output path for placeholder
    const placeholderPath = join(imageDir, `${baseName}-placeholder${ext}`);

    // Generate tiny placeholder with blur
    await sharp(imagePath)
      .resize(PLACEHOLDER_WIDTH, null, {
        withoutEnlargement: true,
        fit: 'inside'
      })
      .blur(1) // Slight blur for smoother appearance
      .jpeg({ quality: PLACEHOLDER_QUALITY, mozjpeg: true })
      .toFile(placeholderPath.replace(/\.(png|jpe?g)$/i, '.jpg'));

    // Get file size
    const placeholderStats = await stat(placeholderPath.replace(/\.(png|jpe?g)$/i, '.jpg'));
    totalSize += placeholderStats.size;

    const relativePath = imagePath.replace(IMAGES_DIR, '').slice(1);
    console.log(`  ${relativePath} -> ${formatBytes(placeholderStats.size)}`);

    processed++;

  } catch (error) {
    console.error(`  Error processing ${imagePath}: ${error.message}`);
    errors++;
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  return (bytes / 1024).toFixed(2) + ' KB';
}

async function main() {
  console.log('Placeholder Image Generation Script\n');
  console.log(`Source directory: ${IMAGES_DIR}`);
  console.log(`Placeholder width: ${PLACEHOLDER_WIDTH}px`);
  console.log(`Quality: ${PLACEHOLDER_QUALITY}\n`);

  try {
    const images = await getAllImages(IMAGES_DIR);

    if (images.length === 0) {
      console.log('No PNG/JPG images found.');
      return;
    }

    console.log(`Found ${images.length} images to process\n`);

    for (const imagePath of images) {
      await generatePlaceholder(imagePath);
    }

    console.log('\n' + '='.repeat(50));
    console.log('Summary:');
    console.log(`   Processed: ${processed}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total placeholder size: ${formatBytes(totalSize)}`);
    console.log(`   Average per placeholder: ${formatBytes(totalSize / processed)}`);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
