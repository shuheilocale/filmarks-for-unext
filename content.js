(() => {
  console.log("[Filmarks] Content script loaded");
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

  function findTitleElement(titleText) {
    if (!titleText) return null;
    const norm = (s) => s.replace(/[\s\u3000]+/g, "");
    const target = norm(titleText);

    // 1. Try heading tags first (fast)
    for (const tag of ["h1", "h2", "h3", "h4"]) {
      for (const el of document.getElementsByTagName(tag)) {
        if (norm(el.textContent) === target) return el;
      }
    }

    // 2. Find text nodes containing parts of the title, then walk up
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim();
      if (text.length >= 2 && target.includes(norm(text))) {
        let el = walker.currentNode.parentElement;
        while (el && el !== document.body) {
          if (norm(el.textContent) === target) return el;
          el = el.parentElement;
        }
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

  function positionBadge(badge, title) {
    const titleEl = findTitleElement(title);
    if (titleEl) {
      titleEl.insertAdjacentElement("afterend", badge);
      return true;
    }
    return false;
  }

  function injectBadge() {
    const title = getMovieTitleFromDocument();
    if (!title) return;

    const existingBadge = document.getElementById("filmarks-score-badge");
    if (title === lastTitle && existingBadge) {
      // Badge exists but might be in wrong position (appended to body initially)
      if (existingBadge.parentElement === document.body) {
        positionBadge(existingBadge, title);
      }
      return;
    }

    removeBadge();
    lastTitle = title;

    const badge = createBadge();
    currentBadge = badge;

    if (!positionBadge(badge, title)) {
      document.body.appendChild(badge);
    }

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
