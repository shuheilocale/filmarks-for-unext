chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "FETCH_FILMARKS") {
    (async () => {
      const result = await fetchFilmarksScore(message.title);
      sendResponse(result);
    })();
    return true;
  }
});

async function fetchFilmarksScore(title) {
  try {
    const searchUrl =
      "https://filmarks.com/search/movies?q=" + encodeURIComponent(title);
    const res = await fetch(searchUrl);
    if (!res.ok) return { error: "search_failed", status: res.status };

    const html = await res.text();
    return parseSearchResults(html, title, searchUrl);
  } catch (e) {
    return { error: e.message };
  }
}

function parseSearchResults(html, queryTitle, searchUrl) {
  // Filmarks uses Vue.js with this structure:
  //   @click="onClickDetailLink($event, '/movies/18935')"
  //   <h3 class="p-content-cassette__title">Movie Title</h3>
  //   <div class="c-rating__score">3.5</div>
  //   <img alt="Movie Title" src="https://d2ueuvlup6lbue.cloudfront.net/...">

  const results = [];

  // Split HTML by each cassette card
  const cards = html.split(/class="p-content-cassette"/);
  // Skip the first segment (before any card)
  for (let i = 1; i < cards.length; i++) {
    const card = cards[i];

    // Extract movie URL from @click handler
    // HTML may use &#39; or ' for quotes
    const urlMatch = card.match(
      /onClickDetailLink\(\$event,\s*(?:'|&#39;)(\/movies\/\d+)(?:'|&#39;)\)/
    );
    // Also try <a href="/movies/..."> as fallback
    const linkMatch = !urlMatch && card.match(/href="(\/movies\/\d+)"/);
    const moviePath = urlMatch ? urlMatch[1] : linkMatch ? linkMatch[1] : null;

    // Extract title from <h3 class="p-content-cassette__title">
    const titleMatch = card.match(
      /p-content-cassette__title"[^>]*>([^<]+)<\/h3>/
    );
    const movieTitle = titleMatch
      ? decodeHTMLEntities(titleMatch[1].trim())
      : null;

    // Extract score from <div class="c-rating__score">3.5</div>
    const scoreMatch = card.match(/c-rating__score"[^>]*>(\d\.\d)<\/div>/);
    const score = scoreMatch ? scoreMatch[1] : null;

    // Extract thumbnail
    const thumbMatch = card.match(
      /<img\s[^>]*src="(https:\/\/d2ueuvlup6lbue\.cloudfront\.net\/[^"]+)"[^>]*>/
    );
    const thumbnail = thumbMatch ? thumbMatch[1] : null;

    if (movieTitle && score) {
      results.push({
        title: movieTitle,
        score,
        url: moviePath ? "https://filmarks.com" + moviePath : null,
        thumbnail,
        searchUrl,
      });
    }
  }

  if (results.length === 0) {
    return { error: "no_results", searchUrl };
  }

  // Try to find best match by title
  const normalizedQuery = normalize(queryTitle);
  for (const r of results) {
    const normalizedMovie = normalize(r.title);
    if (
      normalizedMovie === normalizedQuery ||
      normalizedMovie.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedMovie)
    ) {
      return r;
    }
  }

  // Return first result as fallback
  return results[0];
}

function decodeHTMLEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
}

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[！-～]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    )
    .replace(/[（(）)【】\[\]「」『』]/g, "")
    .replace(/[-−‐ー]/g, "");
}
