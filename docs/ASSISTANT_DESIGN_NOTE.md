# ShopSmart AI Assistant: Design Note

**James Marcus Mercado**  
**BSIT 4-A**

## 1. How it works

The customer enters a question on the AI Assistant page. The page sends it to `/api/assistant/questions`. The server checks the question, finds suitable products in the catalog, and may ask Gemini to write a short answer. The server checks Gemini’s draft before returning it. The page then shows the answer, product links, and sources.

## 2. Product search

The assistant only considers active products that are in stock. If the question includes a budget, products over that price are removed. The remaining products are ranked by words in the question that match the product name, category, or description. The assistant selects up to three matches.

Gemini receives only the selected products’ ID, name, description, category, price, and stock. It does not receive customer names, email addresses, orders, or other private information. Prices are converted from the database value to numbers before they are used.

## 3. Gemini setup

The server calls Google Gemini’s `generateContent` API from `backend/src/services/assistant.js`. The model can be set with `GEMINI_MODEL`; the example configuration uses `gemini-2.5-flash`. The API key belongs in `backend/.env`, which is ignored by Git. The browser does not receive the key.

## 4. Checking the answer

Gemini’s answer is only a draft. The server checks product IDs against the products selected for that question. It builds the product links and source list from those catalog records, not from text supplied by Gemini. If the draft names no selected product or makes a price or stock claim the catalog does not support, the server uses its own catalog-based answer.

## 5. What happens when something goes wrong

If no product matches, the assistant says that it could not find an in-stock match and returns no product links or sources. If Gemini times out, is unavailable, returns invalid data, or makes an unsupported claim, the server uses its rule-based answer. The current page does not add a separate notice saying Gemini was skipped; it displays the answer it receives. If the API itself returns an error, the page shows an error message and ends its loading state.

## 6. Testing and evidence

The tests cover a keyboard match, no match, invalid questions, inactive and out-of-stock products, provider failure, unsupported price and stock claims, and invented source IDs. The keyboard test checks the catalog fixture and its current price. `npm run check` runs lint, tests, and the frontend build.

During development, the assistant page first appeared blank because `AssistantPage.jsx` used JSX without importing React. Adding the React import fixed the page. I verified that the page renders in a browser. The match, no-match, and provider-failure screenshots still need to be added for the final submission.
