/**
 * Image Variant Generation Script
 *
 * Generates WebP and AVIF variants of all images, plus responsive sizes.
 * Run with: node scripts/generate-image-variants.js
 *
 * Options:
 *   --sizes=sm,md,lg,xl  Specify which sizes to generate (default: all)
 *   --formats=webp,avif  Specify which formats to generate (default: all)
 *   --quality=N          Set quality for all formats (default: 80)
 */

import sharp from 'sharp';
import { readdir, stat, mkdir } from 'fs/promises';
import { join, extname, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const IMAGES_DIR = join(ROOT_DIR, 'src', 'assets', 'images');

// Parse command line arguments
const args = process.argv.slice(2);
const qualityArg = args.find(arg => arg.startsWith('--quality='));
const quality = qualityArg ? parseInt(qualityArg.split('=')[1]) : 80;

// Supported input formats
const SUPPORTED_FORMATS = ['.png', '.jpg', '.jpeg'];

// Output formats to generate
const OUTPUT_FORMATS = ['webp', 'avif'];

// Responsive sizes (width in pixels)
const RESPONSIVE_SIZES = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

// Stats tracking
let processed = 0;
let skipped = 0;
let errors = 0;
let totalOriginalSize = 0;
let totalNewSize = 0;

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

async function generateVariants(imagePath) {
  const ext = extname(imagePath).toLowerCase();
  const baseName = basename(imagePath, ext);
  const imageDir = dirname(imagePath);

  try {
    // Get original file info
    const originalStats = await stat(imagePath);
    totalOriginalSize += originalStats.size;

    // Load image with sharp
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    const originalWidth = metadata.width;

    const relativePath = imagePath.replace(IMAGES_DIR, '').slice(1);
    console.log(`\nProcessing: ${relativePath}`);
    console.log(`  Original: ${metadata.width}x${metadata.height} (${formatBytes(originalStats.size)})`);

    // Generate each format
    for (const format of OUTPUT_FORMATS) {
      // Generate full-size variant
      const fullSizePath = join(imageDir, `${baseName}.${format}`);

      let outputImage;
      if (format === 'webp') {
        outputImage = sharp(imagePath).webp({ quality, alphaQuality: quality });
      } else if (format === 'avif') {
        outputImage = sharp(imagePath).avif({ quality, chromaSubsampling: '4:2:0' });
      }

      await outputImage.toFile(fullSizePath);
      const newStats = await stat(fullSizePath);
      totalNewSize += newStats.size;

      const savings = ((originalStats.size - newStats.size) / originalStats.size * 100).toFixed(1);
      console.log(`  ${format.toUpperCase()}: ${formatBytes(newStats.size)} (${savings}% smaller)`);

      // Generate responsive sizes (only for images larger than the target size)
      for (const [sizeName, targetWidth] of Object.entries(RESPONSIVE_SIZES)) {
        if (originalWidth > targetWidth) {
          const responsivePath = join(imageDir, `${baseName}-${sizeName}.${format}`);

          let resizedImage;
          if (format === 'webp') {
            resizedImage = sharp(imagePath)
              .resize(targetWidth, null, { withoutEnlargement: true })
              .webp({ quality, alphaQuality: quality });
          } else if (format === 'avif') {
            resizedImage = sharp(imagePath)
              .resize(targetWidth, null, { withoutEnlargement: true })
              .avif({ quality, chromaSubsampling: '4:2:0' });
          }

          await resizedImage.toFile(responsivePath);
          const resizedStats = await stat(responsivePath);
          totalNewSize += resizedStats.size;
        }
      }
    }

    processed++;

  } catch (error) {
    console.error(`  Error: ${error.message}`);
    errors++;
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function main() {
  console.log('🖼️  Image Variant Generation Script\n');
  console.log(`Source directory: ${IMAGES_DIR}`);
  console.log(`Quality: ${quality}`);
  console.log(`Formats: ${OUTPUT_FORMATS.join(', ')}`);
  console.log(`Responsive sizes: ${Object.keys(RESPONSIVE_SIZES).join(', ')}\n`);

  try {
    const images = await getAllImages(IMAGES_DIR);

    if (images.length === 0) {
      console.log('No PNG/JPG images found.');
      return;
    }

    console.log(`Found ${images.length} images to process\n`);

    for (const imagePath of images) {
      await generateVariants(imagePath);
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 Summary:');
    console.log(`   Processed: ${processed}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Original total: ${formatBytes(totalOriginalSize)}`);
    console.log(`   New variants total: ${formatBytes(totalNewSize)}`);

    if (totalOriginalSize > 0) {
      // Note: This compares originals to ALL variants, not a fair 1:1 comparison
      console.log(`\n💡 Note: Variants include multiple formats and sizes.`);
      console.log(`   For actual savings, compare individual format sizes above.`);
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
