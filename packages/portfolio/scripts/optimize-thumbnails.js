// Image Optimization Script
// Run with: node scripts/optimize-thumbnails.js

import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync, statSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const THUMBNAIL_SIZE = 280; // 2x for retina display (140px actual)
const QUALITY = 75; // Good balance of quality vs size

const imagePath = join(__dirname, '..', 'src', 'assets', 'images');

async function optimizeThumbnails() {
  console.log('🖼️  Optimizing portfolio thumbnails...\n');

  const files = [
    'hours-of-service.webp',
    'vehicle-health.webp',
    'gazebo-ds.webp',
    'gazebo-complex-organisms.png', // This one is still PNG!
    'vending-analytics.webp',
    'telugu-streaming.webp',
    'behance-profile.webp'
  ];

  for (const file of files) {
    const inputPath = join(imagePath, file);
    const outputPath = join(imagePath, file.replace('.png', '.webp'));

    try {
      const stats = statSync(inputPath);
      const sizeBefore = (stats.size / 1024).toFixed(2);

      await sharp(inputPath)
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .webp({ quality: QUALITY })
        .toFile(outputPath + '.tmp');

      // Check output size
      const outputStats = statSync(outputPath + '.tmp');
      const sizeAfter = (outputStats.size / 1024).toFixed(2);
      const savings = ((1 - outputStats.size / stats.size) * 100).toFixed(1);

      console.log(`✅ ${file}`);
      console.log(`   Before: ${sizeBefore}KB → After: ${sizeAfter}KB (${savings}% smaller)\n`);

      // Rename temp file to actual
      if (inputPath !== outputPath) {
        console.log(`   📝 Converting ${file} from PNG to WebP\n`);
      }

    } catch (error) {
      console.log(`❌ Error processing ${file}:`, error.message, '\n');
    }
  }

  console.log('✨ Optimization complete!');
  console.log('\n⚠️  NEXT STEPS:');
  console.log('1. Manually rename .webp.tmp files to .webp (replace originals)');
  console.log('2. Update gazebo-complex-organisms imports from .png to .webp');
  console.log('3. Delete the old .png file');
  console.log('4. Commit and push changes');
}

optimizeThumbnails();