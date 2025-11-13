import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'fs';
import mime from 'mime';
import { DeckIndustry, type DeckMetadata, type SlideData } from './types.js';

export class GeminiClient {
  private ai: GoogleGenAI;
  private model: string = 'gemini-2.5-flash-preview-09-2025';
  private proModel: string = 'gemini-2.5-pro'; // Use Pro for PDF analysis
  private requestCount: number = 0;
  private windowStartTime: number = Date.now();
  private readonly maxRequestsPerMinute: number = 900; // Conservative limit (API allows 1000)

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({
      apiKey: apiKey,
    });
    console.log(`[🤖] Gemini client initialized`);
    console.log(`[📄] PDF Analysis: ${this.proModel}`);
    console.log(`[🖼️] Slide Processing: ${this.model}`);
    console.log(`[⚙️] Rate limit: ${this.maxRequestsPerMinute} requests/minute`);
  }

  /**
   * Wait if we're approaching rate limits
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsedSeconds = (now - this.windowStartTime) / 1000;

    // Reset counter if a minute has passed
    if (elapsedSeconds >= 60) {
      this.requestCount = 0;
      this.windowStartTime = now;
      return;
    }

    // If we've hit the limit, wait until the window resets
    if (this.requestCount >= this.maxRequestsPerMinute) {
      const waitTime = Math.ceil(60 - elapsedSeconds);
      console.log(`    [⏳] Rate limit reached (${this.requestCount}/${this.maxRequestsPerMinute}), waiting ${waitTime}s...`);
      await this.delay(waitTime * 1000);
      this.requestCount = 0;
      this.windowStartTime = Date.now();
    }

    this.requestCount++;
  }

  /**
   * Generate deck-level metadata from PDF file using Gemini Pro
   */
  async generateDeckMetadata(
    pdfPath: string,
    filename: string,
    totalPages: number,
    createdDate: string
  ): Promise<DeckMetadata> {
    await this.checkRateLimit();
    console.log(`    [🧠] Analyzing entire PDF with Gemini Pro...`);

    // Generate industry enum list for prompt
    const industryValues = Object.values(DeckIndustry).join('", "');

    const prompt = `당신은 마케팅/캠페인 제안서 PDF를 분석하고 있습니다. 이 PDF 문서를 읽고 다음 정보를 추출하세요:

1. **deck_industry**: 클라이언트의 산업을 다음 목록 중에서 **정확히** 선택하세요:
   ["${industryValues}"]

   가장 정확하게 일치하는 하나를 선택하세요. 예시:
   - 보험 회사 → "보험"
   - 가구 회사 (사무용/가정용) → "가구-사무용" 또는 "가구-가정용" (더 적합한 것 선택)
   - 전기차 회사 → "자동차-전기차"
   - 마케팅 에이전시 → "마케팅"

2. **company_name**: 덱에 언급된 회사/클라이언트 이름 - 원어 그대로 유지

3. **executive_summary**: 전체 덱의 목적과 주요 전략을 2-3단락으로 상세히 요약하세요. 모든 주요 캠페인 컨셉, 크리에이티브 아이디어, 전략적 접근 방식, 타겟 고객, 핵심 메시지를 포함하세요. PDF의 모든 슬라이드를 읽고 종합적으로 분석하여 작성하세요. - 한국어로 작성

PDF 파일명: ${filename}
총 페이지: ${totalPages}
생성 일자: ${createdDate}

다음 정확한 형식의 유효한 JSON으로만 응답하세요:
{
  "filename": "${filename}",
  "deck_industry": "<위_목록에서_정확히_하나_선택>",
  "company_name": "<회사명>",
  "executive_summary": "<2-3_단락_상세한_한국어_요약>",
  "total_pages": ${totalPages},
  "created_date": "${createdDate}"
}`;

    try {
      console.log(`    [API] Uploading PDF to Gemini Pro...`);

      // Read PDF file
      const pdfBuffer = readFileSync(pdfPath);
      const pdfBase64 = pdfBuffer.toString('base64');

      const contents = [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: pdfBase64,
              },
            },
          ],
        },
      ];

      const response = await this.ai.models.generateContentStream({
        model: this.proModel,
        contents,
      });

      let fullResponse = '';
      for await (const chunk of response) {
        if (chunk.text) {
          fullResponse += chunk.text;
        }
      }
      console.log(`    [✓] Received ${fullResponse.length} characters from Pro model`);

      // Extract JSON from response
      const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error(`    [❌] No valid JSON found in response`);
        throw new Error('No valid JSON found in response');
      }

      const metadata = JSON.parse(jsonMatch[0]);
      console.log(`    [✓] Deck metadata extracted successfully`);

      return metadata as DeckMetadata;
    } catch (error) {
      console.error(`    [❌] Error generating deck metadata:`, error);
      throw new Error(`Failed to generate deck metadata: ${error}`);
    }
  }

  /**
   * Generate slide-level data from individual slide image
   */
  async generateSlideData(
    imagePath: string,
    imageUrl: string,
    slideNumber: number,
    slideContent: string,
    totalPages: number,
    deckContext: string
  ): Promise<SlideData> {
    await this.checkRateLimit();
    try {
      console.log(`      [🧠] Analyzing slide ${slideNumber}/${totalPages}...`);

      // Read image file
      const imageBuffer = readFileSync(imagePath);
      const imageBase64 = imageBuffer.toString('base64');
      const mimeType = mime.getType(imagePath) || 'image/png';

      const prompt = `당신은 마케팅/캠페인 제안서의 슬라이드 ${slideNumber}/${totalPages}를 분석하고 있습니다.

**덱 컨텍스트**: ${deckContext}

**슬라이드 텍스트 내용**: ${slideContent || '[텍스트 추출 안됨]'}

이 슬라이드 이미지와 추출된 텍스트를 분석한 후 다음을 생성하세요:

1. **slide_summary**: 이 슬라이드만의 핵심 주제와 주요 포인트를 포착하는 1-2문장 요약 - 한국어로 작성

2. **keywords**: 이 슬라이드에 대한 5개의 핵심 비즈니스 용어 추출 (예: "고객 획득", "시장 점유율", "Q2 지표", "브랜드 인지도", "캠페인 ROI"). 구체적이고 명확하게 작성 - 한국어로 작성

3. **slide_layout**: 다음을 포함한 슬라이드 레이아웃의 상세한 시각적 설명 - 한국어로 작성:
   - 콘텐츠 유형 및 목적 (예: "데이터 시각화", "전략 프레임워크", "사례 연구", "프로세스 플로우")
   - 존재하는 시각적 요소 (예: "분기별 성장을 보여주는 세로 막대 차트", "3개 원이 있는 벤 다이어그램", "5단계 타임라인", "6개 이미지 포토 그리드", "백분율이 있는 파이 차트", "2x4 비교 표", "8단계 순서도")
   - 텍스트 배치 (예: "상단 제목, 왼쪽 정렬 본문, 오른쪽 불릿 포인트", "중앙 정렬 제목과 하단 부제", "텍스트와 이미지가 있는 2열 레이아웃")
   - 디자인 패턴 (예: "오버레이 텍스트가 있는 전체 화면 이미지", "50/50 분할 화면", "2x2 그리드 레이아웃", "중앙에 단일 초점 이미지")

   좋은 설명 예시:
   - "5년간 매출 성장을 보여주는 세로 막대 차트가 있는 데이터 시각화 슬라이드, 상단 제목, 우측 하단 범례, 각 막대 위에 숫자 표시"
   - "레이블이 지정된 사분면이 있는 2x2 매트릭스를 특징으로 하는 전략 프레임워크 다이어그램, 중앙 제목, 각 사분면의 설명 텍스트"
   - "화살표로 연결된 4개의 수평 단계가 있는 프로세스 타임라인, 각 단계에 아이콘, 제목, 아래 설명 텍스트"
   - "좌측 대형 제품 사진(60%), 우측 고객 후기 인용문 및 지표(40%), 우측 상단 회사 로고가 있는 사례 연구 레이아웃"
   - "중앙 제목, 전체 화면을 덮는 대형 배경 이미지, 하단의 부제 및 날짜가 있는 타이틀 슬라이드"

다음 정확한 형식의 유효한 JSON으로만 응답하세요:
{
  "slide_number": ${slideNumber},
  "slide_content": "${slideContent.replace(/"/g, '\\"').replace(/\n/g, ' ').slice(0, 2000)}",
  "slide_summary": "<1-2_문장_한국어>",
  "keywords": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"],
  "slide_layout": "<상세한_시각적_설명_한국어>",
  "image_url": "${imageUrl}"
}`;

      console.log(`      [API] Sending image request for slide ${slideNumber}...`);
      const contents = [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: imageBase64,
              },
            },
          ],
        },
      ];

      const response = await this.ai.models.generateContentStream({
        model: this.model,
        contents,
      });

      let fullResponse = '';
      for await (const chunk of response) {
        if (chunk.text) {
          fullResponse += chunk.text;
        }
      }

      // Extract JSON from response
      const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn(`      [⚠️] No valid JSON found for slide ${slideNumber}`);
        throw new Error('No valid JSON found in response');
      }

      const slideData = JSON.parse(jsonMatch[0]);

      // CRITICAL FIX: Ensure image_url is always present
      // Gemini API inconsistently includes this field, so we force it
      if (!slideData.image_url) {
        slideData.image_url = imageUrl;
      }

      console.log(`      [✓] Slide ${slideNumber} data extracted`);
      console.log(`          Layout: ${slideData.slide_layout}`);
      console.log(`          Summary: ${slideData.slide_summary.substring(0, 80)}...`);
      console.log(`          Image URL: ${slideData.image_url}`);

      return slideData as SlideData;
    } catch (error) {
      console.error(`      [❌] Error on slide ${slideNumber}:`, error);
      // Return fallback data
      return {
        slide_number: slideNumber,
        slide_content: slideContent || '',
        slide_summary: `슬라이드 ${slideNumber} 내용 추출 오류`,
        keywords: [],
        slide_layout: '알 수 없음',
        image_url: imageUrl
      };
    }
  }

  /**
   * Add delay between API calls to respect rate limits
   */
  async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
