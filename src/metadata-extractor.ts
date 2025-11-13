import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { GeminiClient } from './gemini-client.js';
import { extractPDFText, convertPDFToImages } from './pdf-processor.js';
import { uploadPDFToBlob, uploadSlideImages } from './blob-uploader.js';
import type { PitchDeckData, SlideData, ProcessingConfig } from './types.js';

export class MetadataExtractor {
  private geminiClient: GeminiClient;
  private config: ProcessingConfig;

  constructor(config: ProcessingConfig) {
    this.config = config;
    this.geminiClient = new GeminiClient(config.geminiApiKey);
  }

  /**
   * Process a single PDF file
   */
  async processPDF(pdfPath: string): Promise<PitchDeckData> {
    const filename = path.basename(pdfPath);
    console.log(`\n[📄] Processing: ${filename}`);
    console.log(`[⏰] Started at: ${new Date().toLocaleTimeString()}`);

    // Step 0: Upload PDF to Vercel Blob (if token provided)
    let pdfUrl: string | undefined;
    if (this.config.blobToken) {
      console.log(`\n[STEP 0/4] Uploading PDF to Vercel Blob...`);
      try {
        pdfUrl = await uploadPDFToBlob(pdfPath, this.config.blobToken);
        console.log(`[✓] PDF URL: ${pdfUrl}`);
      } catch (error) {
        console.warn(`[⚠️] PDF upload failed, continuing without Blob URL:`, error);
      }
    }

    // Step 1: Extract text from entire PDF and summarize
    console.log(`\n[STEP 1/4] Extracting and Summarizing PDF...`);
    const pdfContent = await extractPDFText(pdfPath);
    console.log(`[✓] Extracted ${pdfContent.text.length} characters from ${pdfContent.numPages} pages`);

    // Step 2: Generate deck-level metadata from full text
    console.log(`\n[STEP 2/4] Generating Deck-Level Metadata...`);

    // Extract PDF creation date from metadata or use file modification time
    let createdDate = new Date().toISOString();
    if (pdfContent.info?.CreationDate) {
      try {
        // PDF dates are in format: D:YYYYMMDDHHmmSSOHH'mm'
        const dateStr = pdfContent.info.CreationDate.toString();
        const match = dateStr.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
        if (match) {
          const [, year, month, day, hour, minute, second] = match;
          createdDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString();
        }
      } catch (e) {
        console.warn(`    [⚠️] Could not parse PDF creation date, using current date`);
      }
    }

    const deckMetadata = await this.geminiClient.generateDeckMetadata(
      pdfPath,
      filename,
      pdfContent.numPages,
      createdDate
    );

    // Add PDF URL if available
    if (pdfUrl) {
      deckMetadata.pdf_url = pdfUrl;
    }

    console.log(`\n[✓] Deck Metadata:`);
    console.log(`    Industry: ${deckMetadata.deck_industry}`);
    console.log(`    Company: ${deckMetadata.company_name}`);
    console.log(`    Summary: ${deckMetadata.executive_summary}`);
    if (pdfUrl) {
      console.log(`    PDF URL: ${pdfUrl}`);
    }

    // Step 3: Convert PDF to images
    console.log(`\n[STEP 3/4] Converting PDF to Images...`);
    const imageFiles = await convertPDFToImages(pdfPath, this.config.imageDirectory);

    if (imageFiles.length !== pdfContent.numPages) {
      console.warn(`[⚠️] Image count (${imageFiles.length}) doesn't match PDF pages (${pdfContent.numPages})`);
    }

    // Upload images to Vercel Blob (if token provided)
    let imageUrls: string[];
    if (this.config.blobToken) {
      try {
        const pdfBaseName = path.basename(pdfPath, '.pdf');
        imageUrls = await uploadSlideImages(imageFiles, pdfBaseName, this.config.blobToken);
      } catch (error) {
        console.warn(`[⚠️] Image upload failed, using local paths:`, error);
        imageUrls = imageFiles.map(f => f.replace(this.config.imageDirectory, './images'));
      }
    } else {
      // Use local paths
      imageUrls = imageFiles.map(f => f.replace(this.config.imageDirectory, './images'));
    }

    // Step 4: Process each slide image IN PARALLEL (maintaining order)
    const concurrency = this.config.maxConcurrentRequests || 15;
    console.log(`\n[STEP 4/4] Processing ${imageFiles.length} slides with concurrency: ${concurrency}...`);
    console.log(`[⚡] Expected speedup: ~${Math.floor(concurrency / 3)}x faster than previous (3 concurrent)`);

    const deckContext = `${deckMetadata.company_name} - ${deckMetadata.deck_industry} - ${deckMetadata.executive_summary}`;

    // Process all slides in parallel using Promise.all to maintain order
    const slidePromises = imageFiles.map((imagePath, index) => {
      const slideNumber = index + 1;
      const slideContent = pdfContent.pageTexts[index] || '';

      // Use Blob URL or local path
      const imageUrl = imageUrls[index];

      console.log(`    [🚀] Starting slide ${slideNumber}/${imageFiles.length}...`);

      return this.geminiClient.generateSlideData(
        imagePath,
        imageUrl,
        slideNumber,
        slideContent,
        imageFiles.length,
        deckContext
      ).then(slideData => {
        console.log(`    [✓] Slide ${slideNumber} complete - Keywords: ${slideData.keywords.join(', ')}`);
        return slideData;
      });
    });

    // Wait for all slides to complete (order is preserved by Promise.all)
    const slides = await Promise.all(slidePromises);

    console.log(`\n[✓] Completed all ${slides.length} slides`);
    console.log(`[⏰] Finished at: ${new Date().toLocaleTimeString()}`);

    return {
      deck_metadata: deckMetadata,
      slide_data: slides
    };
  }

  /**
   * Process a single PDF file (alias for processPDF for clarity)
   */
  async processSinglePDF(pdfPath: string): Promise<{
    metadata: PitchDeckData;
    outputPath: string;
    totalPages: number;
  }> {
    const pitchDeckData = await this.processPDF(pdfPath);
    const outputPath = await this.savePitchDeckData(pitchDeckData, path.basename(pdfPath));

    return {
      metadata: pitchDeckData,
      outputPath: outputPath,
      totalPages: pitchDeckData.deck_metadata.total_pages
    };
  }

  /**
   * Sanitize filename by replacing spaces and special characters
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/\s+/g, '_')           // Replace spaces with underscores
      .replace(/[()[\]]/g, '')        // Remove brackets and parentheses
      .replace(/[^a-zA-Z0-9_.-]/g, '_'); // Replace other special chars with underscore
  }

  /**
   * Save pitch deck data to JSON file
   */
  async savePitchDeckData(
    data: PitchDeckData,
    originalFilename: string
  ): Promise<string> {
    console.log(`\n[💾] Saving results...`);

    // Create output directory if it doesn't exist
    if (!existsSync(this.config.outputDirectory)) {
      await mkdir(this.config.outputDirectory, { recursive: true});
    }

    // Generate output filename with sanitization
    const baseName = path.basename(originalFilename, '.pdf');
    const sanitizedBaseName = this.sanitizeFilename(baseName);
    const outputPath = path.join(
      this.config.outputDirectory,
      `${sanitizedBaseName}_metadata.json`
    );

    // Write JSON file with pretty formatting
    await writeFile(
      outputPath,
      JSON.stringify(data, null, 2),
      'utf-8'
    );

    console.log(`[✓] Saved to: ${outputPath}`);
    return outputPath;
  }

  /**
   * Validate extracted data
   */
  validateData(data: PitchDeckData): { valid: boolean; errors: string[] } {
    console.log(`\n[🔍] Validating data...`);
    const errors: string[] = [];

    // Validate deck metadata
    if (!data.deck_metadata.filename || data.deck_metadata.filename.trim() === '') {
      errors.push('Missing filename');
    }

    if (!data.deck_metadata.company_name || data.deck_metadata.company_name.trim() === '') {
      errors.push('Missing company name');
    }

    if (!data.deck_metadata.executive_summary || data.deck_metadata.executive_summary.trim() === '') {
      errors.push('Missing executive summary');
    }

    if (!data.deck_metadata.deck_industry || data.deck_metadata.deck_industry.trim() === '') {
      errors.push('Missing deck industry');
    }

    // Validate slides
    if (data.slide_data.length === 0) {
      errors.push('No slides extracted');
    }

    data.slide_data.forEach((slide, index) => {
      if (!slide.slide_summary || slide.slide_summary.trim() === '') {
        errors.push(`Slide ${index + 1}: Missing summary`);
      }

      if (!slide.keywords || slide.keywords.length === 0) {
        errors.push(`Slide ${index + 1}: No keywords`);
      }

      if (!slide.slide_layout || slide.slide_layout.trim() === '') {
        errors.push(`Slide ${index + 1}: Missing layout type`);
      }
    });

    if (errors.length > 0) {
      console.log(`[⚠️] Found ${errors.length} validation issues`);
      errors.forEach(error => console.log(`    - ${error}`));
    } else {
      console.log(`[✓] Validation passed`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate summary statistics
   */
  generateStats(data: PitchDeckData): Record<string, any> {
    console.log(`\n[📊] Generating statistics...`);
    const layoutCounts: Record<string, number> = {};

    data.slide_data.forEach(slide => {
      const layout = slide.slide_layout;
      layoutCounts[layout] = (layoutCounts[layout] || 0) + 1;
    });

    const allKeywords = data.slide_data.flatMap(s => s.keywords);
    const keywordFrequency: Record<string, number> = {};

    allKeywords.forEach(keyword => {
      keywordFrequency[keyword] = (keywordFrequency[keyword] || 0) + 1;
    });

    const topKeywords = Object.entries(keywordFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword, count]) => ({ keyword, count }));

    const stats = {
      total_slides: data.slide_data.length,
      total_pages: data.deck_metadata.total_pages,
      deck_industry: data.deck_metadata.deck_industry,
      company_name: data.deck_metadata.company_name,
      slide_layout_distribution: layoutCounts,
      top_keywords: topKeywords,
      avg_keywords_per_slide: (allKeywords.length / data.slide_data.length).toFixed(2),
      unique_keywords: Object.keys(keywordFrequency).length
    };

    console.log(`[✓] Stats generated`);
    return stats;
  }
}
