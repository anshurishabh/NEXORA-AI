/**
 * Universal web search — free, no API key required.
 * Tries multiple sources in order; returns results from the FIRST one that
 * succeeds. This makes search resilient to any single source being blocked,
 * rate-limited, or changing its HTML structure.
 */

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs || 6000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function stripTags(s) {
  return (s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Source 1 — DuckDuckGo HTML results (general web search)
async function searchDuckDuckGoHTML(query, limit) {
  const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US,en;q=0.9' } }, 6000);
  if (!res.ok) throw new Error('DuckDuckGo HTML failed: ' + res.status);
  const html = await res.text();
  const results = [];
  const regex =
    /<a rel="nofollow" class="result__a" href="([^"]+)">([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = regex.exec(html)) !== null && results.length < limit) {
    let link = m[1];
    const uddg = link.match(/uddg=([^&]+)/);
    if (uddg) {
      try {
        link = decodeURIComponent(uddg[1]);
      } catch (e) {}
    }
    const title = stripTags(m[2]);
    const snippet = stripTags(m[3]);
    if (title) results.push({ title, link, snippet });
  }
  return results;
}

// Source 2 — Google News RSS (great for "today's news" / current-events queries)
async function searchGoogleNewsRSS(query, limit) {
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '&hl=en-IN&gl=IN&ceid=IN:en';
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': BROWSER_UA } }, 6000);
  if (!res.ok) throw new Error('Google News RSS failed: ' + res.status);
  const xml = await res.text();
  const results = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null && results.length < limit) {
    const block = m[1];
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const title = titleMatch ? stripTags(titleMatch[1]) : '';
    const link = linkMatch ? linkMatch[1].trim() : '';
    const pubDate = pubDateMatch ? pubDateMatch[1].trim() : '';
    if (title) results.push({ title, link, snippet: pubDate ? 'Published: ' + pubDate : '' });
  }
  return results;
}

// Source 3 — DuckDuckGo Lite (simpler HTML, sometimes works when the main site is blocked)
async function searchDuckDuckGoLite(query, limit) {
  const url = 'https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(query);
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': BROWSER_UA } }, 6000);
  if (!res.ok) throw new Error('DuckDuckGo Lite failed: ' + res.status);
  const html = await res.text();
  const results = [];
  const regex =
    /<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = regex.exec(html)) !== null && results.length < limit) {
    const title = stripTags(m[2]);
    const snippet = stripTags(m[3]);
    if (title) results.push({ title, link: m[1], snippet });
  }
  return results;
}

// Source 4 — Wikipedia search (last resort — good for factual/encyclopedic topics)
async function searchWikipedia(query, limit) {
  const url =
    'https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=' +
    limit +
    '&srsearch=' +
    encodeURIComponent(query);
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'NEXORA-AI/1.0' } }, 6000);
  if (!res.ok) throw new Error('Wikipedia search failed: ' + res.status);
  const data = await res.json();
  const items = (data.query && data.query.search) || [];
  return items.slice(0, limit).map((it) => ({
    title: it.title,
    link: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(it.title.replace(/ /g, '_')),
    snippet: stripTags(it.snippet || '')
  }));
}

async function webSearch(query, maxResults) {
  const limit = maxResults || 5;
  const sources = [searchDuckDuckGoHTML, searchGoogleNewsRSS, searchDuckDuckGoLite, searchWikipedia];

  for (const source of sources) {
    try {
      const results = await source(query, limit);
      if (results && results.length) return results;
    } catch (e) {
      // this source failed or was blocked — silently try the next one
    }
  }
  return []; // every source failed — caller handles the empty case gracefully
}

module.exports = webSearch;