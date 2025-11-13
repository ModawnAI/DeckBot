import { put } from '@vercel/blob';
import { readFile } from 'fs/promises';
import path from 'path';

/**
 * Sanitize filename for Vercel Blob storage
 * Creates robust, URL-safe filenames
 */
export function sanitizeBlobFilename(filename: string): string {
  // Remove extension temporarily
  const ext = path.extname(filename);
  let base = path.basename(filename, ext);

  // Replace spaces with hyphens
  base = base.replace(/\s+/g, '-');

  // Remove special characters, keep only alphanumeric, hyphen, underscore
  base = base.replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ_-]/g, '');

  // Remove consecutive hyphens/underscores
  base = base.replace(/[-_]+/g, '-');

  // Trim hyphens from start/end
  base = base.replace(/^-+|-+$/g, '');

  // If base is empty after sanitization, use timestamp
  if (!base) {
    base = `file-${Date.now()}`;
  }

  // Lowercase for consistency
  base = base.toLowerCase();

  return `${base}${ext}`;
}

/**
 * Upload PDF to Vercel Blob storage
 */
export async function uploadPDFToBlob(
  pdfPath: string,
  token: string
): Promise<string> {
  console.log(`    [☁️] Uploading PDF to Vercel Blob...`);

  const filename = path.basename(pdfPath);
  const sanitizedFilename = sanitizeBlobFilename(filename);
  const blobPath = `pdfs/${sanitizedFilename}`;

  // Read PDF file
  const fileBuffer = await readFile(pdfPath);

  // Upload to Vercel Blob
  const { url } = await put(blobPath, fileBuffer, {
    access: 'public',
    token: token,
    contentType: 'application/pdf'
  });

  console.log(`    [✓] PDF uploaded: ${url}`);
  return url;
}

/**
 * Upload slide image to Vercel Blob storage
 */
export async function uploadImageToBlob(
  imagePath: string,
  pdfBaseName: string,
  slideNumber: number,
  token: string
): Promise<string> {
  const ext = path.extname(imagePath);
  const sanitizedPdfName = sanitizeBlobFilename(pdfBaseName);
  const blobPath = `images/${sanitizedPdfName}/slide-${slideNumber.toString().padStart(3, '0')}${ext}`;

  // Read image file
  const imageBuffer = await readFile(imagePath);

  // Determine content type
  const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';

  // Upload to Vercel Blob
  const { url } = await put(blobPath, imageBuffer, {
    access: 'public',
    token: token,
    contentType: contentType
  });

  return url;
}

/**
 * Upload all slide images for a PDF
 */
export async function uploadSlideImages(
  imageFiles: string[],
  pdfBaseName: string,
  token: string
): Promise<string[]> {
  console.log(`    [☁️] Uploading ${imageFiles.length} slide images to Vercel Blob...`);

  const uploadPromises = imageFiles.map((imagePath, index) => {
    const slideNumber = index + 1;
    return uploadImageToBlob(imagePath, pdfBaseName, slideNumber, token);
  });

  const urls = await Promise.all(uploadPromises);

  console.log(`    [✓] All ${urls.length} images uploaded`);
  return urls;
}

/**
 * Test blob upload functionality
 */
export async function testBlobUpload(token: string): Promise<void> {
  console.log('\n[🧪] Testing Vercel Blob upload...');

  const testContent = 'Hello from DeckBot! ' + new Date().toISOString();
  const testPath = `test/hello-${Date.now()}.txt`;

  try {
    const { url } = await put(testPath, testContent, {
      access: 'public',
      token: token,
      contentType: 'text/plain'
    });

    console.log(`[✓] Test upload successful: ${url}`);
    return;
  } catch (error) {
    console.error(`[❌] Test upload failed:`, error);
    throw error;
  }
}
