/**
 * Industry categories for pitch decks
 */
export enum DeckIndustry {
  // Technology
  SOFTWARE = "소프트웨어",
  HARDWARE = "하드웨어",
  FINTECH = "핀테크",
  ECOMMERCE = "이커머스",
  SAAS = "SaaS",
  AI_ML = "AI/머신러닝",
  BLOCKCHAIN = "블록체인",
  CYBERSECURITY = "사이버보안",

  // Consumer
  CONSUMER_GOODS = "소비재",
  FASHION = "패션",
  BEAUTY = "뷰티",
  FOOD_BEVERAGE = "식음료",
  RETAIL = "유통",

  // Business Services
  MARKETING = "마케팅",
  ADVERTISING = "광고",
  CONSULTING = "컨설팅",
  HR = "인사/채용",
  LOGISTICS = "물류",

  // Finance & Insurance
  FINANCE = "금융",
  INSURANCE = "보험",
  REAL_ESTATE = "부동산",
  INVESTMENT = "투자",

  // Healthcare
  HEALTHCARE = "헬스케어",
  BIOTECH = "바이오",
  PHARMA = "제약",
  MEDTECH = "의료기기",

  // Manufacturing & Industrial
  MANUFACTURING = "제조",
  AUTOMOTIVE = "자동차",
  AUTOMOTIVE_EV = "자동차-전기차",
  FURNITURE = "가구",
  FURNITURE_OFFICE = "가구-사무용",
  FURNITURE_HOME = "가구-가정용",
  CONSTRUCTION = "건설",

  // Energy & Environment
  ENERGY = "에너지",
  RENEWABLE_ENERGY = "신재생에너지",
  ENVIRONMENT = "환경",

  // Media & Entertainment
  MEDIA = "미디어",
  ENTERTAINMENT = "엔터테인먼트",
  GAMING = "게임",
  CONTENT = "콘텐츠",

  // Education & Training
  EDUCATION = "교육",
  EDTECH = "에듀테크",

  // Travel & Hospitality
  TRAVEL = "여행",
  HOSPITALITY = "숙박",
  FOOD_SERVICE = "외식",

  // Telecommunications
  TELECOM = "통신",

  // Agriculture
  AGRICULTURE = "농업",
  AGTECH = "농업기술",

  // Other
  OTHER = "기타"
}

/**
 * Deck-level metadata structure - describes the entire proposal
 */
export interface DeckMetadata {
  filename: string;
  deck_industry: DeckIndustry;
  company_name: string;
  executive_summary: string;
  total_pages: number;
  created_date: string; // ISO 8601 format: YYYY-MM-DDTHH:mm:ssZ
  pdf_url?: string; // Optional: Vercel Blob URL for the PDF
}

/**
 * Slide-level data structure - describes individual slides
 */
export interface SlideData {
  slide_number: number;
  slide_content: string;
  slide_summary: string;
  keywords: string[];
  slide_layout: string;
  image_url: string; // URL to the slide image (Vercel Blob or relative path)
}

/**
 * Complete pitch deck structure
 */
export interface PitchDeckData {
  deck_metadata: DeckMetadata;
  slide_data: SlideData[];
}

/**
 * Raw extracted text from PDF
 */
export interface PDFContent {
  text: string;
  numPages: number;
  pageTexts: string[];  // Text content for each individual page
  info?: {
    Title?: string;
    Author?: string;
    Subject?: string;
    Creator?: string;
    CreationDate?: string;
    ModDate?: string;
  };
}

/**
 * Configuration for processing
 */
export interface ProcessingConfig {
  pdfDirectory: string;
  outputDirectory: string;
  imageDirectory: string;
  geminiApiKey: string;
  blobToken?: string; // Optional: Enable Vercel Blob upload
  maxConcurrentRequests?: number; // Default: 15 (optimized for Gemini 900 RPM limit)
}
