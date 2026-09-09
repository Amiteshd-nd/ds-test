/**
 * Image Optimization Script
 *
 * Converts all PNG/JPG images to WebP format while keeping originals.
 * Run with: node scripts/convert-to-webp.js
 *
 * Options:
 *   --replace    Delete original files after conversion
 *   --quality=N  Set WebP quality (default: 80)
 */

import sharp from 'sharp';
import { readdir, stat, unlink } from 'fs/promises';
import { join, extname, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const IMAGES_DIR = join(ROOT_DIR, 'src', 'assets', 'images');

// Parse command line arguments
const args = process.argv.slice(2);
const shouldReplace = args.includes('--replace');
const qualityArg = args.find(arg => arg.startsWith('--quality='));
const quality = qualityArg ? parseInt(qualityArg.split('=')[1]) : 80;

// Supported formats
const SUPPORTED_FORMATS = ['.png', '.jpg', '.jpeg'];

// Stats tracking
let converted = 0;
let skipped = 0;
let totalSaved = 0;

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
        if (SUPPORTED_FORMATS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  await walk(dir);
  return files;
}

async function convertToWebP(imagePath) {
  const ext = extname(imagePath).toLowerCase();
  const webpPath = imagePath.replace(/\.(png|jpe?g)$/i, '.webp');

  try {
    // Get original file size
    const originalStats = await stat(imagePath);
    const originalSize = originalStats.size;

    // Convert to WebP
    await sharp(imagePath)
      .webp({ quality, alphaQuality: quality })
      .toFile(webpPath);

    // Get new file size
    const webpStats = await stat(webpPath);
    const webpSize = webpStats.size;

    // Calculate savings
    const saved = originalSize - webpSize;
    const percentage = ((saved / originalSize) * 100).toFixed(1);

    const relativePath = imagePath.replace(IMAGES_DIR, '').slice(1);

    if (saved > 0) {
      console.log(`✓ ${relativePath}`);
      console.log(`  ${formatBytes(originalSize)} → ${formatBytes(webpSize)} (${percentage}% smaller)`);
      totalSaved += saved;
      converted++;

      // Delete original if --replace flag is set
      if (shouldReplace) {
        await unlink(imagePath);
        console.log(`  Deleted original`);
      }
    } else {
      // WebP is larger, keep original
      await unlink(webpPath);
      console.log(`⊘ ${relativePath} - WebP larger, keeping original`);
      skipped++;
    }

  } catch (error) {
    console.error(`✗ Error converting ${imagePath}:`, error.message);
    skipped++;
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function main() {
  console.log('🖼️  Image Optimization Script\n');
  console.log(`Source directory: ${IMAGES_DIR}`);
  console.log(`WebP quality: ${quality}`);
  console.log(`Replace originals: ${shouldReplace ? 'Yes' : 'No'}\n`);

  try {
    const images = await getAllImages(IMAGES_DIR);

    if (images.length === 0) {
      console.log('No PNG/JPG images found.');
      return;
    }

    console.log(`Found ${images.length} images to convert\n`);

    for (const imagePath of images) {
      await convertToWebP(imagePath);
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 Summary:');
    console.log(`   Converted: ${converted}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total saved: ${formatBytes(totalSaved)}`);

    if (!shouldReplace && converted > 0) {
      console.log('\n💡 Tip: Run with --replace to delete original files');
      console.log('   node scripts/convert-to-webp.js --replace');
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
