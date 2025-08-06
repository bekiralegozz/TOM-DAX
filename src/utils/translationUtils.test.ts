import { 
    isTurkishText,
    getTranslationSuggestions,
    TranslationResult
} from './translationUtils';

// Test cases for Turkish-English translation
console.log('=== Turkish-English Translation Test ===\n');

// Test 1: Basic Turkish detection
console.log('1. Turkish Detection Test:');
console.log('isTurkishText("müşteri"): ', isTurkishText("müşteri"));
console.log('isTurkishText("customer"): ', isTurkishText("customer"));
console.log('isTurkishText("En çok satış yapan müşteriler"): ', isTurkishText("En çok satış yapan müşteriler"));
console.log('isTurkishText("Top selling customers"): ', isTurkishText("Top selling customers"));
console.log();

// Test 2: Translation results simulation
console.log('2. Translation Result Test:');
const mockTranslationResult: TranslationResult = {
    originalText: "En çok gelir getiren 10 müşteriyi göster",
    translatedText: "Show me the top 10 customers by revenue",
    wasTranslated: true,
    confidence: 0.95
};

const suggestions = getTranslationSuggestions(mockTranslationResult);
console.log('Original:', mockTranslationResult.originalText);
console.log('Translated:', mockTranslationResult.translatedText);
console.log('Confidence:', Math.round(mockTranslationResult.confidence * 100) + '%');
console.log('Suggestions:', suggestions);
console.log();

// Test 3: Non-translated content
console.log('3. Non-Turkish Content Test:');
const englishResult: TranslationResult = {
    originalText: "Show me top 10 customers by revenue",
    translatedText: "Show me top 10 customers by revenue",
    wasTranslated: false,
    confidence: 1.0
};

const englishSuggestions = getTranslationSuggestions(englishResult);
console.log('Original:', englishResult.originalText);
console.log('Translated:', englishResult.translatedText);
console.log('Was Translated:', englishResult.wasTranslated);
console.log('Suggestions:', englishSuggestions);
console.log();

// Test 4: Low confidence translation
console.log('4. Low Confidence Translation Test:');
const lowConfidenceResult: TranslationResult = {
    originalText: "Çok karmaşık bir analiz sorgusu",
    translatedText: "A very complex analysis query",
    wasTranslated: true,
    confidence: 0.65
};

const lowConfidenceSuggestions = getTranslationSuggestions(lowConfidenceResult);
console.log('Original:', lowConfidenceResult.originalText);
console.log('Translated:', lowConfidenceResult.translatedText);
console.log('Confidence:', Math.round(lowConfidenceResult.confidence * 100) + '%');
console.log('Suggestions:', lowConfidenceSuggestions);
console.log();

console.log('=== Translation Test Complete ===');
console.log('Note: LLM-based translation requires backend connection for full testing.');

// Export test function for use in components
export function runTranslationDemo() {
    const testQueries = [
        "En çok satış yapan 5 müşteriyi göster",
        "Bu ay toplam gelir ne kadar?",
        "Stoku 10'dan az olan ürünler",
        "Aktif çalışanların listesi",
        "Geçen hafta yapılan siparişler"
    ];

    console.log('\n=== Live Translation Demo ===');
    console.log('Note: This demo shows Turkish queries that would be translated by LLM:');
    testQueries.forEach(query => {
        console.log(`Turkish: "${query}"`);
        console.log(`Turkish detected: ${isTurkishText(query)}`);
        console.log('---');
    });
} 