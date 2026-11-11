const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'below', 'best', 'budget', 'can', 'for', 'from',
  'good', 'have', 'help', 'i', 'in', 'is', 'it', 'less', 'looking', 'me',
  'need', 'of', 'on', 'or', 'php', 'please', 'product', 'products', 'recommend',
  'shopsmart', 'show', 'than', 'that', 'the', 'to', 'under', 'what', 'which',
  'with', 'worth'
]);

export function parseMaxBudget(question) {
  const normalized = String(question || '');
  const match = normalized.match(
    /(?:under|below|less than|max(?:imum)?|budget(?:\s+of)?|<=?)\s*(?:php|₱)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i
  ) || normalized.match(/(?:php|₱)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);

  if (!match) {
    return null;
  }

  const value = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

function tokenizeQuestion(question) {
  return String(question || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token) && !/^\d+$/.test(token));
}

function normalizeProduct(product) {
  return {
    id: product.id,
    name: product.name,
    description: product.description || '',
    category: product.category || 'General',
    price: Number(product.price),
    stock: Number(product.stock),
    isActive: product.active ?? product.isActive ?? true
  };
}

export function rankProductsForQuestion(question, products) {
  const tokens = tokenizeQuestion(question);
  const maxBudget = parseMaxBudget(question);

  return (products || [])
    .filter((product) => product && product.active !== false && product.isActive !== false && Number(product.stock) > 0)
    .map(normalizeProduct)
    .filter((product) => (maxBudget === null ? true : product.price <= maxBudget))
    .map((product) => {
      const searchable = `${product.name} ${product.category} ${product.description}`.toLowerCase();
      const matchedTerms = tokens.filter((token) => searchable.includes(token));
      const nameMatches = tokens.filter((token) => product.name.toLowerCase().includes(token));

      return {
        product,
        matchedTerms,
        score: matchedTerms.length * 2 + nameMatches.length
      };
    })
    .filter((entry) => (tokens.length === 0 ? true : entry.score > 0))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.product.price - right.product.price;
    });
}

function formatPhp(amount) {
  return `₱${Number(amount).toLocaleString('en-PH', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  })}`;
}

/**
 * Deterministic rule-based response builder (used when no match or when AI fails/hallucinates)
 */
export function buildRuleBasedResponse(question, ranked) {
  const maxBudget = parseMaxBudget(question);

  if (ranked.length === 0) {
    const budgetNote = maxBudget !== null ? ` under ${formatPhp(maxBudget)}` : '';
    return {
      answer: `I could not find an in-stock catalog product matching that request${budgetNote}. Try a broader keyword or a higher budget.`,
      recommendedProducts: [],
      sources: []
    };
  }

  const topMatches = ranked.slice(0, 3);
  const recommendedProducts = topMatches.map(({ product }) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    price: product.price,
    stock: product.stock,
    link: `/products/${product.id}`
  }));

  const sources = topMatches.map(({ product, matchedTerms }) => ({
    id: product.id,
    name: product.name,
    matchedTerms
  }));

  const summary = recommendedProducts
    .map((product) => `${product.name} (${formatPhp(product.price)}, ${product.stock} in stock)`)
    .join('; ');

  return {
    answer: `Based on the current ShopSmart catalog, look at ${summary}.`,
    recommendedProducts,
    sources
  };
}

/**
 * Checks that any ₱ price mentioned in the AI draft actually matches one of the selected products
 */
function hasUnsupportedPriceClaim(answerText, selectedProducts) {
  const allowedPrices = new Set(selectedProducts.map((p) => Number(p.price)));
  const priceMatches = [...String(answerText).matchAll(/(?:₱|PHP\s*|\bpesos?\s*)([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi)];

  for (const match of priceMatches) {
    const claimedPrice = Number(match[1].replace(/,/g, ''));
    if (Number.isFinite(claimedPrice) && !allowedPrices.has(claimedPrice)) {
      return true;
    }
  }
  return false;
}

function hasUnsupportedStockClaim(answerText, selectedProducts) {
  const text = String(answerText).toLowerCase();
  if (/\b(out of stock|unavailable|not available)\b/i.test(text)) return true;

  const stockMatches = [...text.matchAll(/\b([0-9][0-9,]*)\s+in stock\b/gi)];
  if (stockMatches.some((match) => {
    const claim = Number(match[1].replace(/,/g, ''));
    return !selectedProducts.some((product) => product.stock === claim);
  })) return true;

  return /\b(in stock|available)\b/i.test(text) && selectedProducts.every((product) => product.stock <= 0);
}

/**
 * Calls the AI Provider on the server to draft an answer from selected facts
 */
async function requestProviderDraft(question, candidateFacts, options = {}) {
  const apiKey = options.apiKey !== undefined ? options.apiKey : process.env.GEMINI_API_KEY;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  if (!apiKey || typeof fetchImpl !== 'function') {
    return null;
  }

  const prompt = `You are the ShopSmart Grounded Product Assistant.
Answer the customer's question using ONLY the candidate catalog facts below.
Rules:
1. Do not invent specifications, warranties, ratings, or availability not listed in the facts.
2. Quote exact prices in Philippine Pesos (e.g., ₱1,850).
3. Return strict JSON with keys:
   - "answer": string (concise, helpful explanation citing exact product name and price)
   - "recommendedIds": array of numbers (only IDs from the provided candidate facts)
   - "sourceIds": array of numbers (only IDs from the provided candidate facts)

Customer Question: ${JSON.stringify(question)}
Candidate Catalog Facts: ${JSON.stringify(candidateFacts)}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    }),
    signal: AbortSignal.timeout(4500)
  });

  if (!response.ok) {
    throw new Error(`Provider HTTP ${response.status}`);
  }

  const payload = await response.json();
  const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Empty response from AI provider');
  }

  return JSON.parse(rawText.trim());
}

/**
 * Main assistant entry point: retrieves subset, optionally calls AI provider, verifies claims, and falls back cleanly.
 */
export async function answerProductQuestion(question, products, options = {}) {
  const ranked = rankProductsForQuestion(question, products);

  // Decision: Do not call the AI provider when no catalog products qualify
  if (ranked.length === 0) {
    return buildRuleBasedResponse(question, ranked);
  }

  const topMatches = ranked.slice(0, 3);
  const fallback = buildRuleBasedResponse(question, ranked);

  // Send only the 6 public product fields needed for the answer
  const candidateFacts = topMatches.map(({ product }) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    price: product.price,
    stock: product.stock
  }));

  try {
    const draft = await requestProviderDraft(question, candidateFacts, options);
    if (!draft || typeof draft.answer !== 'string' || !draft.answer.trim()) {
      return fallback;
    }

    const allowedMap = new Map(topMatches.map((entry) => [entry.product.id, entry]));

    // Verify recommendedIds and sourceIds against our whitelist of selected products
    const verifiedRecIds = Array.isArray(draft.recommendedIds)
      ? draft.recommendedIds.map(Number).filter((id) => allowedMap.has(id))
      : [];

    const verifiedSourceIds = Array.isArray(draft.sourceIds)
      ? draft.sourceIds.map(Number).filter((id) => allowedMap.has(id))
      : [];

    const finalRecIds = verifiedRecIds.length > 0
      ? [...new Set(verifiedRecIds)]
      : topMatches.map(({ product }) => product.id);

    const finalSourceIds = verifiedSourceIds.length > 0
      ? [...new Set(verifiedSourceIds)]
      : finalRecIds;

    // Verify price and stock claims against current catalog data
    const selectedProducts = finalRecIds.map((id) => allowedMap.get(id).product);
    const mentionsSupportedProduct = selectedProducts.some((p) =>
      draft.answer.toLowerCase().includes(p.name.toLowerCase())
    );

    if (
      hasUnsupportedPriceClaim(draft.answer, candidateFacts) ||
      hasUnsupportedStockClaim(draft.answer, selectedProducts) ||
      !mentionsSupportedProduct
    ) {
      return fallback;
    }

    const recommendedProducts = finalRecIds.map((id) => {
      const { product } = allowedMap.get(id);
      return {
        id: product.id,
        name: product.name,
        category: product.category,
        price: product.price,
        stock: product.stock,
        link: `/products/${product.id}`
      };
    });

    const sources = finalSourceIds.map((id) => {
      const { product, matchedTerms } = allowedMap.get(id);
      return {
        id: product.id,
        name: product.name,
        matchedTerms
      };
    });

    return {
      answer: draft.answer.trim(),
      recommendedProducts,
      sources
    };
} catch {
    // Graceful fallback on timeout, invalid JSON format, rate limit, or unavailable provider
    return fallback;
  }
}
