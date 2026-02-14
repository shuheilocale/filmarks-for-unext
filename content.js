(() => {
  let lastTitle = "";
  let currentBadge = null;

  function getMovieTitleFromDocument() {
    const docTitle = document.title;
    // "シド・アンド・ナンシー(洋画 / 1986) - 動画配信 | U-NEXT"
    // Extract just the movie name before any parentheses, dash-separated metadata
    let cleaned = docTitle;
    // Remove " | U-NEXT" or " - U-NEXT" suffix
    cleaned = cleaned.replace(/\s*[|\-–—]\s*U-NEXT.*$/, "");
    // Remove " - 動画配信" etc.
    cleaned = cleaned.replace(/\s*[-–—]\s*動画配信.*$/, "");
    // Remove "(洋画 / 1986)" etc.
    cleaned = cleaned.replace(/\s*[（(].*$/, "");
    cleaned = cleaned.trim();
    return cleaned.length >= 2 ? cleaned : null;
  }

  function getMovieTitleFromDOM() {
    // U-NEXT uses styled-components with hashed class names,
    // so we look for generic heading elements
    const headings = document.querySelectorAll("h1, h2, h3");
    for (const el of headings) {
      const text = el.textContent.trim();
      if (text.length >= 2 && text.length <= 100) {
        // Skip section headers
        if (
          /^(おすすめ|関連|あなた|新着|ランキング|特集|カテゴリ|ジャンル|見どころ|ストーリー|ここがポイント|キャスト|スタッフ|エピソード)/.test(
            text
          )
        ) {
          continue;
        }
        return { text, element: el };
      }
    }
    return null;
  }

  function removeBadge() {
    const existing = document.getElementById("filmarks-score-badge");
    if (existing) existing.remove();
    currentBadge = null;
  }

  function createBadge() {
    const badge = document.createElement("div");
    badge.id = "filmarks-score-badge";
    badge.className = "loading";
    badge.innerHTML = `
      <span class="filmarks-logo">Filmarks</span>
      <span class="filmarks-rating">読み込み中...</span>
    `;
    return badge;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function updateBadge(badge, data) {
    if (!badge || !badge.isConnected) return;
    badge.className = "";
    if (data.error || !data.score) {
      badge.innerHTML = `
        <span class="filmarks-logo">Filmarks</span>
        <span class="filmarks-rating" style="color:#8b95a5;font-size:12px;">スコアなし</span>
      `;
      return;
    }

    const movieUrl = data.url || "https://filmarks.com";
    const searchUrl = data.searchUrl || movieUrl;
    const thumbHtml = data.thumbnail
      ? `<img class="filmarks-thumb" src="${escapeHtml(data.thumbnail)}" alt="">`
      : "";
    const titleHtml = data.title
      ? `<span class="filmarks-match-title">${escapeHtml(data.title)}</span>`
      : "";

    badge.innerHTML = `
      ${thumbHtml}
      <div class="filmarks-info">
        <a class="filmarks-main-link" href="${escapeHtml(movieUrl)}" target="_blank" rel="noopener noreferrer">
          <span class="filmarks-logo">Filmarks</span>
          <span class="filmarks-star">★</span>
          <span class="filmarks-rating">${escapeHtml(data.score)}</span>
        </a>
        ${titleHtml}
        <a class="filmarks-search-link" href="${escapeHtml(searchUrl)}" target="_blank" rel="noopener noreferrer">検索結果を見る</a>
      </div>
    `;

    // Prevent U-NEXT's event handlers from swallowing link clicks
    badge.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.stopPropagation();
        window.open(a.href, "_blank");
      });
    });
  }

  function injectBadge() {
    // Already showing for this title?
    const docTitle = getMovieTitleFromDocument();
    const title = docTitle;
    if (!title) return;
    if (title === lastTitle && document.getElementById("filmarks-score-badge"))
      return;

    removeBadge();
    lastTitle = title;

    const badge = createBadge();
    currentBadge = badge;

    // Append to body as fixed-position overlay (immune to React re-renders)
    document.body.appendChild(badge);

    console.log("[Filmarks] Searching for:", title);

    // Fetch the score
    chrome.runtime.sendMessage(
      { type: "FETCH_FILMARKS", title },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("[Filmarks] Runtime error:", chrome.runtime.lastError);
          updateBadge(badge, { error: "runtime_error" });
          return;
        }
        console.log("[Filmarks] Response:", response);
        updateBadge(badge, response || { error: "no_response" });
      }
    );
  }

  function isDetailPage() {
    const url = location.href;
    // /title/SID... direct page
    if (/video\.unext\.jp\/title\/SID/.test(url)) return true;
    // ?td=SID... modal overlay
    if (/[?&]td=SID/.test(url)) return true;
    return false;
  }

  function checkPage() {
    if (!isDetailPage()) {
      removeBadge();
      lastTitle = "";
      return;
    }
    injectBadge();
  }

  // Debounce helper
  let debounceTimer = null;
  function debouncedCheck() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(checkPage, 500);
  }

  // 1. MutationObserver for DOM changes
  const observer = new MutationObserver(debouncedCheck);
  observer.observe(document.body, { childList: true, subtree: true });

  // 2. Intercept pushState/replaceState for SPA navigation
  const origPushState = history.pushState.bind(history);
  const origReplaceState = history.replaceState.bind(history);
  history.pushState = function (...args) {
    origPushState(...args);
    debouncedCheck();
  };
  history.replaceState = function (...args) {
    origReplaceState(...args);
    debouncedCheck();
  };

  // 3. popstate for back/forward navigation
  window.addEventListener("popstate", debouncedCheck);

  // Initial check with delay for SPA rendering
  setTimeout(checkPage, 1000);
  setTimeout(checkPage, 3000);
})();
