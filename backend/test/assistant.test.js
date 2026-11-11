import test from 'node:test';
import assert from 'node:assert/strict';
import {
  answerProductQuestion,
  parseMaxBudget,
  rankProductsForQuestion
} from '../src/services/assistant.js';

const sampleProducts = [
  {
    id: 1,
    name: 'Compact Mechanical Keyboard',
    description: 'Hot-swappable 75% keyboard for desk setups.',
    category: 'Accessories',
    price: 1850,
    stock: 14,
    isActive: true
  },
  {
    id: 2,
    name: 'Pro Wireless Mechanical Keyboard',
    description: 'Tri-mode mechanical keyboard with aluminum top plate.',
    category: 'Accessories',
    price: 3290,
    stock: 8,
    isActive: true
  },
  {
    id: 3,
    name: 'Out of Stock Budget Keyboard',
    description: 'Compact keyboard that should not be recommended when stock is zero.',
    category: 'Accessories',
    price: 990,
    stock: 0,
    isActive: true
  }
];

test('parseMaxBudget extracts peso budgets', () => {
  assert.equal(parseMaxBudget('Which keyboard is below ₱2,000?'), 2000);
  assert.equal(parseMaxBudget('Recommend something under PHP 1,500.50'), 1500.5);
  assert.equal(parseMaxBudget('Which keyboard has hot-swappable switches?'), null);
});

test('rankProductsForQuestion excludes out-of-stock and over-budget products', () => {
  const ranked = rankProductsForQuestion('Which keyboard is below ₱2,000?', sampleProducts);

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].product.id, 1);
});

test('answerProductQuestion returns grounded sources for matching products (fallback mode)', async () => {
  const result = await answerProductQuestion('Which keyboard is below ₱2,000?', sampleProducts, {
    apiKey: ''
  });

  assert.match(result.answer, /Compact Mechanical Keyboard/);
  assert.equal(result.recommendedProducts.length, 1);
  assert.equal(result.sources[0].id, 1);
});

test('answerProductQuestion returns honest no-match response without calling provider', async () => {
  let providerCalled = false;
  const result = await answerProductQuestion('Do you have a refrigerator?', sampleProducts, {
    apiKey: 'test-key',
    fetchImpl: async () => {
      providerCalled = true;
      throw new Error('Should not be called');
    }
  });

  assert.equal(providerCalled, false);
  assert.equal(result.recommendedProducts.length, 0);
  assert.equal(result.sources.length, 0);
  assert.match(result.answer, /could not find an in-stock catalog product/i);
});

test('answerProductQuestion uses verified AI draft and filters out invented IDs', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  answer: 'The Compact Mechanical Keyboard is in stock for ₱1,850.',
                  recommendedIds: [1, 999],
                  sourceIds: [1, 888]
                })
              }
            ]
          }
        }
      ]
    })
  });

  const result = await answerProductQuestion('Which keyboard is below ₱2,000?', sampleProducts, {
    apiKey: 'fake-key',
    fetchImpl: mockFetch
  });

  assert.equal(result.answer, 'The Compact Mechanical Keyboard is in stock for ₱1,850.');
  assert.deepEqual(result.recommendedProducts.map((p) => p.id), [1]);
  assert.deepEqual(result.sources.map((s) => s.id), [1]);
});

test('answerProductQuestion rejects AI draft if it claims an unsupported price', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  answer: 'The Compact Mechanical Keyboard is on sale for ₱500!',
                  recommendedIds: [1],
                  sourceIds: [1]
                })
              }
            ]
          }
        }
      ]
    })
  });

  const result = await answerProductQuestion('Which keyboard is below ₱2,000?', sampleProducts, {
    apiKey: 'fake-key',
    fetchImpl: mockFetch
  });

  // Falls back to rule-based summary with accurate price
  assert.match(result.answer, /₱1,850/);
  assert.doesNotMatch(result.answer, /₱500/);
});

test('answerProductQuestion rejects unsupported stock quantities and falls back', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        answer: 'The Compact Mechanical Keyboard is ₱1,850 with 99 in stock.',
        recommendedIds: [1],
        sourceIds: [1]
      }) }] } }]
    })
  });

  const result = await answerProductQuestion('Which keyboard is below ₱2,000?', sampleProducts, {
    apiKey: 'fake-key',
    fetchImpl: mockFetch
  });

  assert.match(result.answer, /14 in stock/);
  assert.doesNotMatch(result.answer, /99 in stock/);
});

test('rankProductsForQuestion excludes products using the Prisma active field', () => {
  const ranked = rankProductsForQuestion('keyboard', [
    { ...sampleProducts[0], active: false, isActive: undefined }
  ]);
  assert.equal(ranked.length, 0);
});

test('answerProductQuestion falls back cleanly when provider fails', async () => {
  const mockFetch = async () => {
    throw new Error('Provider timeout or 503');
  };

  const result = await answerProductQuestion('Which keyboard is below ₱2,000?', sampleProducts, {
    apiKey: 'fake-key',
    fetchImpl: mockFetch
  });

  assert.match(result.answer, /Compact Mechanical Keyboard/);
  assert.equal(result.recommendedProducts.length, 1);
  assert.equal(result.sources[0].id, 1);
});
