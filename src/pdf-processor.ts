import { readFile, readdir, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import pdf from 'pdf-parse';
import type { PDFContent } from './types.js';

const execPromise = promisify(exec);

/**
 * Extract text content from PDF (full text and per-page)
 */
export async function extractPDFText(pdfPath: string): Promise<PDFContent> {
  try {
    console.log(`    [📄] Reading PDF file...`);
    const dataBuffer = await readFile(pdfPath);

    console.log(`    [📄] Parsing PDF structure...`);
    const data = await pdf(dataBuffer);

    // Extract per-page text using pdf-parse page rendering
    console.log(`    [📄] Extracting per-page text content...`);
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= data.numpages; pageNum++) {
      try {
        const pageData = await pdf(dataBuffer, {
          max: pageNum,
          pagerender: (pageData: any) => {
            return pageData.getTextContent().then((textContent: any) => {
              return textContent.items.map((item: any) => item.str).join(' ');
            });
          }
        });

        // Get text for this specific page
        const previousPagesData = pageNum > 1 ? await pdf(dataBuffer, { max: pageNum - 1 }) : { text: '' };
        const thisPageText = pageData.text.substring(previousPagesData.text.length).trim();
        pageTexts.push(thisPageText);
      } catch (pageError) {
        console.warn(`    [⚠️] Could not extract text from page ${pageNum}, using empty string`);
        pageTexts.push('');
      }
    }

    console.log(`    [✓] Extracted text from ${data.numpages} pages (${pageTexts.length} page texts)`);
    return {
      text: data.text,
      numPages: data.numpages,
      pageTexts: pageTexts,
      info: data.info as PDFContent['info']
    };
  } catch (error) {
    throw new Error(`Failed to extract PDF text from ${pdfPath}: ${error}`);
  }
}

/**
 * Convert PDF to images using pdftoppm (poppler-utils)
 */
/**
 * Sanitize filename by replacing spaces and special characters
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/\s+/g, '_')           // Replace spaces with underscores
    .replace(/[()[\]]/g, '')        // Remove brackets and parentheses
    .replace(/[^a-zA-Z0-9_.-]/g, '_'); // Replace other special chars with underscore
}

export async function convertPDFToImages(
  pdfPath: string,
  outputDir: string
): Promise<string[]> {
  try {
    console.log(`    [🖼️] Converting PDF to images...`);

    // Create output directory if it doesn't exist
    const filename = path.basename(pdfPath, '.pdf');
    const sanitizedFilename = sanitizeFilename(filename);
    const imageOutputDir = path.join(outputDir, sanitizedFilename);

    if (!existsSync(imageOutputDir)) {
      await mkdir(imageOutputDir, { recursive: true });
    }

    // Use pdftoppm to convert all pages to PNG images
    // -png: output format
    // -r 150: resolution 150 DPI (good balance of quality and file size)
    const outputPrefix = path.join(imageOutputDir, 'slide');
    const command = `pdftoppm -png -r 150 "${pdfPath}" "${outputPrefix}"`;

    console.log(`    [CMD] Converting with pdftoppm...`);
    const { stdout, stderr } = await execPromise(command);

    if (stderr && !stderr.includes('Syntax Warning')) {
      console.log(`    [⚠️] pdftoppm stderr: ${stderr}`);
    }

    // pdftoppm creates files with format: slide-1.png, slide-2.png, slide-3.png, etc.
    const files = await readdir(imageOutputDir);
    const imageFiles = files
      .filter(f => f.endsWith('.png'))
      .sort((a, b) => {
        // Extract page number from format "slide-N.png"
        const getNum = (name: string) => {
          const match = name.match(/slide-(\d+)\.png/);
          return match ? parseInt(match[1]) : 0;
        };
        return getNum(a) - getNum(b);
      })
      .map(f => path.join(imageOutputDir, f));

    if (imageFiles.length === 0) {
      throw new Error('No images were generated');
    }

    console.log(`    [✓] Generated ${imageFiles.length} slide images`);
    return imageFiles;
  } catch (error) {
    throw new Error(`Failed to convert PDF to images: ${error}`);
  }
}

/**
 * Get list of PDF files from directory
 */
export async function getPDFFiles(directory: string): Promise<string[]> {
  try {
    const files = await readdir(directory);
    const pdfFiles = files
      .filter(f => f.toLowerCase().endsWith('.pdf'))
      .map(f => path.join(directory, f));

    return pdfFiles;
  } catch (error) {
    throw new Error(`Failed to read PDF directory ${directory}: ${error}`);
  }
}
