/**
 * Universal web search — free, no API key required.
 * Uses DuckDuckGo's HTML endpoint so ANY agent/provider (Groq, Mistral,
 * Cerebras, OpenRouter — not just Gemini) can get live, current results
 * injected into its prompt as context.
 */
async function webSearch(query, maxResults) {
  const limit = maxResults || 5;
  const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NEXORA-AI-Search/1.0'
    }
  });

  if (!res.ok) {
    throw new Error('Web search request failed with status ' + res.status);
  }

  const html = await res.text();
  const results = [];

  // DuckDuckGo HTML result blocks: link + title, then a snippet
  const resultRegex =
    /<a rel="nofollow" class="result__a" href="([^"]+)">([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  let match;
  while ((match = resultRegex.exec(html)) !== null && results.length < limit) {
    let link = match[1];
    // DuckDuckGo wraps real URLs behind /l/?uddg=<encoded-url>
    const uddgMatch = link.match(/uddg=([^&]+)/);
    if (uddgMatch) {
      try {
        link = decodeURIComponent(uddgMatch[1]);
      } catch (e) {
        // keep raw link if decoding fails
      }
    }
    const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const title = stripTags(match[2]);
    const snippet = stripTags(match[3]);
    if (title) results.push({ title, link, snippet });
  }

  return results;
}

module.exports = webSearch;