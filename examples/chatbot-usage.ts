/**
 * DeckBot Chatbot - Usage Examples
 *
 * Shows how to use the Pinecone query library in your chatbot
 */

import { DeckBotQuery, searchSlides, searchDecks, searchCascade } from '../src/pinecone-query';

// ============================================================================
// EXAMPLE 1: Simple Slide Search (Most Common)
// ============================================================================

async function example1_simpleSlideSearch() {
  console.log('=== Example 1: Simple Slide Search ===\n');

  // User asks: "마케팅 전략에 대한 슬라이드를 보여줘"
  const results = await searchSlides('마케팅 전략');

  console.log(`Found ${results.length} slides:\n`);
  results.slice(0, 3).forEach((slide, i) => {
    console.log(`${i + 1}. ${slide.company} - Slide ${slide.slideNumber}`);
    console.log(`   Score: ${slide.score.toFixed(4)}`);
    console.log(`   Preview: ${slide.preview}`);
    console.log(`   Image: ${slide.imageUrl}\n`);
  });
}

// ============================================================================
// EXAMPLE 2: Filtered Search
// ============================================================================

async function example2_filteredSearch() {
  console.log('=== Example 2: Filtered Search ===\n');

  // User asks: "2024년 이후 Technology 업계 AI 관련 슬라이드"
  const results = await searchSlides(
    'AI 인공지능',
    {
      industry: 'Technology',
      yearFrom: 2024,
      keywords: ['AI', '인공지능'],
    },
    5
  );

  console.log(`Found ${results.length} filtered slides:\n`);
  results.forEach((slide, i) => {
    console.log(`${i + 1}. ${slide.company} (${slide.industry})`);
    console.log(`   Date: ${slide.createdDate}`);
    console.log(`   Keywords: ${slide.keywords.join(', ')}`);
    console.log(`   ${slide.preview}\n`);
  });
}

// ============================================================================
// EXAMPLE 3: Deck Discovery
// ============================================================================

async function example3_deckDiscovery() {
  console.log('=== Example 3: Deck Discovery ===\n');

  // User asks: "삼성 관련 프레젠테이션 찾아줘"
  const results = await searchDecks('삼성 전략', { company: 'Samsung' });

  console.log(`Found ${results.length} decks:\n`);
  results.forEach((deck, i) => {
    console.log(`${i + 1}. ${deck.company} - ${deck.industry}`);
    console.log(`   Slides: ${deck.totalSlides}`);
    console.log(`   Preview: ${deck.preview}`);
    console.log(`   PDF: ${deck.pdfUrl}\n`);
  });
}

// ============================================================================
// EXAMPLE 4: Cascade Search (High Precision)
// ============================================================================

async function example4_cascadeSearch() {
  console.log('=== Example 4: Cascade Search (Best Matches) ===\n');

  // User asks: "디지털 전환에 대한 가장 관련성 높은 슬라이드"
  const results = await searchCascade('디지털 전환 전략', undefined, 10);

  console.log(`Found ${results.length} high-precision slides:\n`);
  results.slice(0, 5).forEach((slide, i) => {
    console.log(`${i + 1}. ${slide.company} - Slide ${slide.slideNumber}`);
    console.log(`   Score: ${slide.score.toFixed(4)}`);
    console.log(`   ${slide.preview}\n`);
  });
}

// ============================================================================
// EXAMPLE 5: Chatbot Integration (Full Example)
// ============================================================================

async function example5_chatbotIntegration() {
  console.log('=== Example 5: Chatbot Integration ===\n');

  const db = new DeckBotQuery();

  // Simulate user conversation
  const userMessages = [
    { query: 'LG 전자 마케팅 전략', filters: { company: 'LG' } },
    { query: 'AI 관련 슬라이드', filters: { keywords: ['AI'] } },
    { query: '2024년 프레젠테이션', filters: { yearFrom: 2024 } },
  ];

  for (const msg of userMessages) {
    console.log(`User: "${msg.query}"`);

    const results = await db.querySlides({
      query: msg.query,
      filters: msg.filters,
      topK: 3,
    });

    console.log(`Bot: Found ${results.length} results`);
    results.forEach((slide, i) => {
      console.log(`  ${i + 1}. ${slide.company} - Slide ${slide.slideNumber}`);
      console.log(`     ${slide.preview.substring(0, 100)}...`);
    });
    console.log();
  }
}

// ============================================================================
// EXAMPLE 6: Intent-Based Routing
// ============================================================================

async function example6_intentBasedRouting(userQuery: string, intent: 'deck' | 'slide' | 'specific') {
  console.log('=== Example 6: Intent-Based Routing ===\n');
  console.log(`User: "${userQuery}"`);
  console.log(`Detected Intent: ${intent}\n`);

  const db = new DeckBotQuery();

  switch (intent) {
    case 'deck':
      // User wants to find presentations
      const decks = await db.queryDecks({ query: userQuery, topK: 5 });
      console.log(`Found ${decks.length} presentations`);
      return decks;

    case 'slide':
      // User wants specific slides
      const slides = await db.querySlides({ query: userQuery, topK: 10 });
      console.log(`Found ${slides.length} slides`);
      return slides;

    case 'specific':
      // User wants most relevant matches
      const cascade = await db.queryCascade({ query: userQuery, topK: 10 });
      console.log(`Found ${cascade.length} high-precision matches`);
      return cascade;
  }
}

// ============================================================================
// EXAMPLE 7: Multi-Filter Complex Query
// ============================================================================

async function example7_complexQuery() {
  console.log('=== Example 7: Complex Multi-Filter Query ===\n');

  // User asks: "2023-2024년 사이 Healthcare 또는 Technology 업계의
  //            AI, 디지털 관련 슬라이드"

  const db = new DeckBotQuery();

  // Healthcare results
  const healthcareResults = await db.querySlides({
    query: 'AI 디지털 혁신',
    topK: 5,
    filters: {
      industry: 'Healthcare',
      keywords: ['AI', '디지털'],
      yearFrom: 2023,
      yearTo: 2024,
    },
  });

  // Technology results
  const techResults = await db.querySlides({
    query: 'AI 디지털 혁신',
    topK: 5,
    filters: {
      industry: 'Technology',
      keywords: ['AI', '디지털'],
      yearFrom: 2023,
      yearTo: 2024,
    },
  });

  // Combine and deduplicate
  const allResults = [...healthcareResults, ...techResults];
  const uniqueResults = Array.from(
    new Map(allResults.map((item) => [item.id, item])).values()
  );

  // Sort by score
  uniqueResults.sort((a, b) => b.score - a.score);

  console.log(`Found ${uniqueResults.length} unique slides:\n`);
  uniqueResults.slice(0, 5).forEach((slide, i) => {
    console.log(`${i + 1}. ${slide.company} (${slide.industry})`);
    console.log(`   Slide ${slide.slideNumber} | Score: ${slide.score.toFixed(4)}`);
    console.log(`   ${slide.preview}\n`);
  });
}

// ============================================================================
// EXAMPLE 8: Error Handling
// ============================================================================

async function example8_errorHandling(userQuery: string) {
  console.log('=== Example 8: Error Handling ===\n');

  try {
    const db = new DeckBotQuery();

    const results = await db.querySlides({
      query: userQuery,
      topK: 10,
      filters: {
        industry: 'InvalidIndustry', // This will return 0 results
      },
    });

    if (results.length === 0) {
      console.log('Bot: 죄송합니다. 검색 결과가 없습니다.');
      console.log('     다른 키워드나 필터를 시도해보세요.');
      return null;
    }

    console.log(`Found ${results.length} results`);
    return results;
  } catch (error) {
    console.error('Bot: 오류가 발생했습니다:', error);
    console.log('     잠시 후 다시 시도해주세요.');
    return null;
  }
}

// ============================================================================
// RUN EXAMPLES
// ============================================================================

async function main() {
  try {
    // Run individual examples
    // await example1_simpleSlideSearch();
    // await example2_filteredSearch();
    // await example3_deckDiscovery();
    // await example4_cascadeSearch();
    // await example5_chatbotIntegration();
    // await example6_intentBasedRouting('LG 마케팅 전략', 'slide');
    // await example7_complexQuery();
    await example8_errorHandling('test query');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Uncomment to run
// main();

export {
  example1_simpleSlideSearch,
  example2_filteredSearch,
  example3_deckDiscovery,
  example4_cascadeSearch,
  example5_chatbotIntegration,
  example6_intentBasedRouting,
  example7_complexQuery,
  example8_errorHandling,
};
