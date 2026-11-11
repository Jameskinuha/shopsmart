import express from 'express';
import * as prismaModule from '../lib/prisma.js';
import { answerProductQuestion } from '../services/assistant.js';
import * as schemas from '../validators/schemas.js';

const router = express.Router();
const prisma = prismaModule.prisma || prismaModule.default;

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const requestWindows = new Map();

function rateLimitAssistant(req, res, next) {
  const key = req.ip || 'global';
  const now = Date.now();
  const current = requestWindows.get(key);

  if (!current || now - current.startedAt >= WINDOW_MS) {
    requestWindows.set(key, { startedAt: now, count: 1 });
    return next();
  }

  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Assistant request limit reached. Please wait a minute and try again.'
    });
  }

  current.count += 1;
  return next();
}

function validateQuestionPayload(body) {
  // Dynamically find the assistant validator exported by validators/schemas.js
  const validatorEntry = Object.entries(schemas).find(
    ([name, fn]) => typeof fn === 'function' && /assistant|question/i.test(name)
  );

  if (validatorEntry) {
    const result = validatorEntry[1](body);
    if (result && typeof result === 'object') {
      // Support both { valid, errors, value } and { success, error, data } shapes
      if ('valid' in result) {
        return {
          valid: result.valid,
          question: result.value?.question ?? String(body?.question || '').trim(),
          errors: result.errors || ['Question must be between 3 and 300 characters.']
        };
      }
      if ('success' in result) {
        return {
          valid: result.success,
          question: result.data?.question ?? String(body?.question || '').trim(),
          errors: result.error?.issues?.map((i) => i.message) || ['Invalid question']
        };
      }
    }
  }

  // Built-in 3 to 300 character check
  const raw = typeof body?.question === 'string' ? body.question.trim() : '';
  if (raw.length < 3 || raw.length > 300) {
    return {
      valid: false,
      question: raw,
      errors: ['question must be between 3 and 300 characters']
    };
  }

  return { valid: true, question: raw, errors: [] };
}

router.post('/questions', rateLimitAssistant, async (req, res, next) => {
  try {
    const validation = validateQuestionPayload(req.body);
    if (!validation.valid) {
      return res.status(422).json({
        error: 'Validation failed',
        message: validation.errors[0] || 'Question must be between 3 and 300 characters.',
        details: validation.errors
      });
    }

    const products = await prisma.product.findMany({
      where: {
        active: true,
        stock: { gt: 0 }
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        price: true,
        stock: true,
        active: true
      },
      orderBy: { id: 'asc' }
    });

    const response = await answerProductQuestion(validation.question, products);
    return res.json(response);
  } catch (error) {
    return next(error);
  }
});

export default router;
