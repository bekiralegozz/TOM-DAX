// LLM-based Turkish-English translation utilities for offline use
export interface TranslationResult {
  originalText: string;
  translatedText: string;
  wasTranslated: boolean;
  confidence: number;
}

// Detect if text contains Turkish characters or words
export function isTurkishText(text: string): boolean {
  if (!text) return false;
  
  // Turkish specific characters
  const turkishChars = /[çğıöşüÇĞIİÖŞÜ]/;
  
  // Turkish words that are commonly used in data queries
  const turkishWords = [
    'müşteri', 'satış', 'ürün', 'göster', 'listele', 'topla', 'hesapla',
    'bul', 'ara', 'en', 'çok', 'az', 'büyük', 'küçük', 'tarih', 'ay',
    'yıl', 'gün', 'toplam', 'ortalama', 'maksimum', 'minimum', 'aktif',
    'pasif', 'şirket', 'çalışan', 'departman', 'sipariş', 'gelir', 'kar',
    'stok', 'envanter', 'kategori', 'marka', 'nedir', 'nerede', 'nasıl',
    'hangi', 'kadar', 'tane', 'adet', 'olan', 'olmayan', 'ile', 've',
    'veya', 'den', 'dan', 'a', 'e', 'da', 'de', 'ta', 'te'
  ];
  
  // Check for Turkish characters
  if (turkishChars.test(text)) return true;
  
  // Check for Turkish words
  const lowerText = text.toLowerCase();
  return turkishWords.some(word => lowerText.includes(word));
}

// LLM-based translation function
export async function translateTurkishToEnglishWithLLM(
  text: string,
  activeModel: any
): Promise<TranslationResult> {
  if (!text || !isTurkishText(text)) {
    return {
      originalText: text,
      translatedText: text,
      wasTranslated: false,
      confidence: 1.0
    };
  }

  try {
    const response = await fetch('/api/indexing/translate-query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: text,  // Send the Turkish text directly
        model: activeModel,
        original_text: text
      })
    });

    if (!response.ok) {
      throw new Error(`Translation API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.status === 'success' && data.translated_text) {
      return {
        originalText: text,
        translatedText: data.translated_text.trim(),
        wasTranslated: true,
        confidence: data.confidence || 0.9
      };
    } else {
      throw new Error(data.message || 'Translation failed');
    }
  } catch (error) {
    console.error('LLM translation failed, falling back to dictionary:', error);
    
    // Fallback to simple dictionary-based translation
    const fallbackTranslation = simpleDictionaryTranslate(text);
    return {
      originalText: text,
      translatedText: fallbackTranslation,
      wasTranslated: fallbackTranslation !== text,
      confidence: 0.6
    };
  }
}

// Simple fallback dictionary translation
function simpleDictionaryTranslate(text: string): string {
  const basicDictionary: { [key: string]: string } = {
    // Most common data analysis terms
    "göster": "show",
    "bul": "find",
    "listele": "list",
    "en çok": "most",
    "en az": "least",
    "müşteri": "customer",
    "müşteriler": "customers",
    "satış": "sales",
    "ürün": "product",
    "ürünler": "products",
    "toplam": "total",
    "ortalama": "average",
    "maksimum": "maximum",
    "minimum": "minimum",
    "tarih": "date",
    "ay": "month",
    "yıl": "year",
    "gün": "day",
    "stok": "inventory",
    "gelir": "revenue",
    "kar": "profit",
    "aktif": "active",
    "pasif": "inactive",
    "şirket": "company",
    "çalışan": "employee",
    "çalışanlar": "employees",
    "departman": "department",
    "sipariş": "order",
    "siparişler": "orders",
    "kategori": "category",
    "marka": "brand",
    "nedir": "what is",
    "nerede": "where",
    "nasıl": "how",
    "hangi": "which",
    "kadar": "how much",
    "tane": "count",
    "adet": "count",
    "olan": "that",
    "olmayan": "not",
    "ile": "with",
    "ve": "and",
    "veya": "or"
  };

  let translatedText = text.toLowerCase();
  
  // Replace Turkish terms with English equivalents
  Object.entries(basicDictionary).forEach(([turkish, english]) => {
    const regex = new RegExp(`\\b${turkish}\\b`, 'gi');
    translatedText = translatedText.replace(regex, english);
  });

  return translatedText;
}

// Get translation suggestions for user feedback
export function getTranslationSuggestions(result: TranslationResult): string[] {
  const suggestions: string[] = [];
  
  if (result.wasTranslated) {
    suggestions.push(`Translated from Turkish: "${result.originalText}" → "${result.translatedText}"`);
    
    if (result.confidence < 0.8) {
      suggestions.push(`Translation confidence: ${Math.round(result.confidence * 100)}%`);
    }
  }
  
  return suggestions;
}

// Enhanced translation with retry mechanism
export async function smartTranslateTurkishToEnglish(
  text: string,
  activeModel: any,
  maxRetries: number = 2
): Promise<TranslationResult> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await translateTurkishToEnglishWithLLM(text, activeModel);
      
      // Validate translation quality
      if (result.wasTranslated && result.translatedText.length > 0) {
        return result;
      }
    } catch (error) {
      lastError = error as Error;
      console.warn(`Translation attempt ${attempt + 1} failed:`, error);
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }
  
  console.error('All translation attempts failed, using fallback:', lastError);
  
  // Final fallback
  const fallbackTranslation = simpleDictionaryTranslate(text);
  return {
    originalText: text,
    translatedText: fallbackTranslation,
    wasTranslated: fallbackTranslation !== text,
    confidence: 0.5
  };
} 