import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const imgDiscoveryIcon = "https://www.figma.com/api/mcp/asset/c12345f2-bad5-4085-9068-014b06b84fbd";
const imgDiscoveryCaretDown = "https://www.figma.com/api/mcp/asset/d86b7f23-f54e-445b-aad8-5acf7ac6106d";

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
  const outputDir = './src/assets/images/projects/vehicle-health';

  // Ensure output directory exists
  mkdirSync(outputDir, { recursive: true });

  await downloadImage(
    imgDiscoveryIcon,
    `${outputDir}/discovery-icon.webp`
  );

  await downloadImage(
    imgDiscoveryCaretDown,
    `${outputDir}/discovery-caret-down.webp`
  );

  console.log('\n✨ Discovery icons download complete!');
}

main();
