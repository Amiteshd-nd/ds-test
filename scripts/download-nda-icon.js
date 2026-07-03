import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const imgLockKey = "https://www.figma.com/api/mcp/asset/f6f133a9-d73e-4018-9037-027f85be991d";

async function downloadImage(url, outputPath) {
  try {
    console.log(`Downloading ${outputPath}...`);
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Convert to WebP
    const webpBuffer = await sharp(buffer)
      .webp({ quality: 90 })
      .toBuffer();

    writeFileSync(outputPath, webpBuffer);
    console.log(`✓ ${outputPath} downloaded successfully`);
  } catch (error) {
    console.error(`Error downloading ${outputPath}:`, error);
  }
}

async function main() {
  const outputDir = './src/assets/images/projects/telugu-streaming';

  // Ensure output directory exists
  mkdirSync(outputDir, { recursive: true });

  await downloadImage(
    imgLockKey,
    `${outputDir}/nda-lock-icon.webp`
  );

  console.log('\n✨ NDA icon download complete!');
}

main();
