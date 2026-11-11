import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

async function requestHealth(database) {
  const server = createApp({ database }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('health reports success when the database query succeeds', async () => {
  const result = await requestHealth({ $queryRaw: async () => [{ '?column?': 1 }] });
  assert.deepEqual(result, { status: 200, body: { status: 'ok' } });
});

test('health reports service unavailable when the database query fails', async () => {
  const result = await requestHealth({ $queryRaw: async () => { throw new Error('database offline'); } });
  assert.deepEqual(result, {
    status: 503,
    body: { status: 'error', message: 'Database is unavailable.' }
  });
});
