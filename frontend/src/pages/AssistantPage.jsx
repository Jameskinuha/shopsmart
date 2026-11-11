import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import StatusMessage from '../components/StatusMessage';

const SAMPLE_QUESTIONS = [
  'Which keyboard is below ₱2,000?',
  'What ergonomic accessories are in stock?',
  'Recommend a USB-C hub under ₱1,600.'
];

async function submitQuestionToApi(question) {
  const rawBase = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  const baseUrl = rawBase.endsWith('/api') ? rawBase : `${rawBase.replace(/\/$/, '')}/api`;

  const res = await fetch(`${baseUrl}/assistant/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question })
  });

  const data = await res.json();
  if (!res.ok) {
    const errMsg =
      data?.error?.details?.[0] ||
      data?.details?.[0] ||
      data?.error?.message ||
      data?.message ||
      'Could not complete the assistant request.';
    throw new Error(errMsg);
  }
  return data;
}

export default function AssistantPage() {
  const [question, setQuestion] = useState(SAMPLE_QUESTIONS[0]);
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await submitQuestionToApi(question);
      setResponse(data);
    } catch (err) {
      setError(err.message || 'Could not get an assistant answer.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Guided challenge starter</p>
          <h1>Product Assistant</h1>
        </div>
      </div>

      <section className="panel assistant-panel">
        <p className="muted">
          Ask about products, categories, stock, or budgets. Verify every recommendation against the
          catalog before trusting it.
        </p>

        <div className="sample-questions">
          {SAMPLE_QUESTIONS.map((sample) => (
            <button
              key={sample}
              type="button"
              className="chip-button"
              onClick={() => setQuestion(sample)}
            >
              {sample}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="assistant-form">
          <label htmlFor="assistant-question">Your question</label>
          <textarea
            id="assistant-question"
            rows="3"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Example: Which keyboard is below ₱2,000?"
          />
          <button type="submit" className="button" disabled={loading}>
            {loading ? 'Checking catalog...' : 'Ask ShopSmart'}
          </button>
        </form>
      </section>

      <StatusMessage loading={loading} error={error} />

      {response && !loading ? (
        <section className="panel assistant-answer" aria-live="polite">
          <h2>Answer</h2>
          <p>{response.answer}</p>

          {response.recommendedProducts?.length > 0 ? (
            <div>
              <h3>Recommended products</h3>
              <ul className="recommended-list">
                {response.recommendedProducts.map((product) => (
                  <li key={product.id}>
                    <Link to={`/products/${product.id}`}>{product.name}</Link>
                    <span>
                      ₱{Number(product.price).toLocaleString('en-PH')} · {product.stock} in stock
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="muted">No matching in-stock products were found for this query.</p>
          )}

          {response.sources?.length > 0 ? (
            <div
              className="sources-section"
              style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}
            >
              <h4>Verified Catalog Sources</h4>
              <ul className="sources-list">
                {response.sources.map((source) => (
                  <li key={source.id}>
                    <Link to={`/products/${source.id}`}>
                      Source #{source.id}: {source.name}
                    </Link>
                    {source.matchedTerms?.length > 0 ? (
                      <span className="muted"> (matched: {source.matchedTerms.join(', ')})</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
