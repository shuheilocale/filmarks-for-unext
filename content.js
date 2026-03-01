(() => {
  console.log("[Ratings] Content script loaded");
  let lastTitle = "";

  const BADGE_STYLES = `
    :host {
      display: block;
      margin: 8px 0;
      pointer-events: auto !important;
    }
    * {
      pointer-events: auto !important;
    }
    .container {
      display: inline-flex;
      align-items: stretch;
      gap: 0;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
    }
    .container.loading {
      padding: 4px 12px;
    }
    .loading-text {
      font-size: 11px;
      color: #8b95a5;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      text-decoration: none;
      cursor: pointer;
      transition: background 0.2s;
      color: inherit;
    }
    .chip:hover {
      background: rgba(255, 255, 255, 0.06);
    }
    .chip + .chip {
      border-left: 1px solid rgba(255, 255, 255, 0.1);
    }
    .thumb {
      width: 28px;
      height: 40px;
      object-fit: cover;
      border-radius: 3px;
      flex-shrink: 0;
    }
    .info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .main-row {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .score {
      font-size: 16px;
      font-weight: 700;
      color: #ffffff;
    }
    .star {
      color: #f5c518;
      font-size: 14px;
    }
    .icon {
      font-size: 14px;
    }
    .match-title {
      font-size: 11px;
      color: #8b95a5;
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .filmarks-logo {
      font-weight: 700;
      font-size: 11px;
      color: #f5c518;
      letter-spacing: 0.5px;
    }
    .rt-logo {
      font-weight: 700;
      font-size: 10px;
      color: #FA320A;
      letter-spacing: 0.3px;
    }
    .rt-scores {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .rt-critics { font-size: 15px; }
    .rt-audience { font-size: 15px; color: #ccc; }
  `;

  function getMovieTitleFromDocument() {
    const docTitle = document.title;
    let cleaned = docTitle;
    cleaned = cleaned.replace(/\s*[|\-–—]\s*U-NEXT.*$/, "");
    cleaned = cleaned.replace(/\s*[-–—]\s*動画配信.*$/, "");
    cleaned = cleaned.replace(/\s*[（(].*$/, "");
    cleaned = cleaned.trim();
    return cleaned.length >= 2 ? cleaned : null;
  }

  function getYearFromPage() {
    // Strategy 1: document title often has （2016） or (2016)
    const titleMatch = document.title.match(/[（(](\d{4})[）)]/);
    if (titleMatch) {
      const y = parseInt(titleMatch[1], 10);
      if (y >= 1900 && y <= 2099) return y;
    }

    // Strategy 2: JSON-LD structured data
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(script.textContent);
        const dateStr = data.datePublished || data.dateCreated || data.releaseDate;
        if (dateStr) {
          const y = parseInt(dateStr.substring(0, 4), 10);
          if (y >= 1900 && y <= 2099) return y;
        }
      } catch (e) { /* ignore */ }
    }

    // Strategy 3: U-NEXT pattern "2016年 | アメリカ" in short text elements
    for (const el of document.querySelectorAll("div, span, p")) {
      const text = el.textContent.trim();
      if (text.length > 30) continue;
      const m = text.match(/^(\d{4})年/);
      if (m) {
        const y = parseInt(m[1], 10);
        if (y >= 1900 && y <= 2099) return y;
      }
    }

    return null;
  }

  function findTitleElement(titleText) {
    if (!titleText) return null;
    const norm = (s) => s.replace(/[\s\u3000]+/g, "");
    const target = norm(titleText);

    for (const tag of ["h1", "h2", "h3", "h4"]) {
      for (const el of document.getElementsByTagName(tag)) {
        if (norm(el.textContent) === target) return el;
      }
    }

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
    const existing = document.getElementById("unext-ratings-host");
    if (existing) existing.remove();
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function createBadge() {
    const host = document.createElement("div");
    host.id = "unext-ratings-host";
    host.style.cssText = "pointer-events:auto !important;";
    const shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = BADGE_STYLES;
    shadow.appendChild(style);

    const container = document.createElement("div");
    container.className = "container loading";
    container.innerHTML = `<span class="loading-text">読み込み中...</span>`;
    shadow.appendChild(container);

    host._container = container;
    return host;
  }

  function updateBadge(host, data) {
    if (!host || !host.isConnected) return;
    const container = host._container;

    const filmarks = data.filmarks;
    const rt = data.rt;
    const hasFilmarks = filmarks && !filmarks.error && filmarks.score;
    const hasRT = rt && !rt.error && (rt.criticsScore || rt.audienceScore);

    if (!hasFilmarks && !hasRT) {
      container.className = "container";
      container.innerHTML = `<span class="loading-text">スコアなし</span>`;
      return;
    }

    container.className = "container";
    container.innerHTML = "";

    // Filmarks chip
    if (hasFilmarks) {
      const movieUrl = filmarks.url || "https://filmarks.com";
      const chip = document.createElement("a");
      chip.className = "chip";
      chip.href = movieUrl;
      chip.target = "_blank";
      chip.rel = "noopener noreferrer";

      let inner = "";
      if (filmarks.thumbnail) {
        inner += `<img class="thumb" src="${escapeHtml(filmarks.thumbnail)}" alt="">`;
      }
      inner += `<div class="info">
        <div class="main-row">
          <span class="filmarks-logo">Filmarks</span>
          <span class="star">★</span>
          <span class="score">${escapeHtml(filmarks.score)}</span>
        </div>`;
      if (filmarks.title) {
        inner += `<span class="match-title">${escapeHtml(filmarks.title)}</span>`;
      }
      inner += `</div>`;
      chip.innerHTML = inner;

      chip.addEventListener("click", (e) => {
        e.preventDefault();
        console.log("[Ratings] Filmarks click!", movieUrl);
        chrome.runtime.sendMessage({ type: "OPEN_TAB", url: movieUrl });
      });

      container.appendChild(chip);
    }

    // RT chip
    if (hasRT) {
      const rtUrl = rt.url || "https://www.rottentomatoes.com";
      const chip = document.createElement("a");
      chip.className = "chip";
      chip.href = rtUrl;
      chip.target = "_blank";
      chip.rel = "noopener noreferrer";

      let scoresHtml = "";
      if (rt.criticsScore) {
        const icon = parseInt(rt.criticsScore, 10) >= 60 ? "🍅" : "🤢";
        scoresHtml += `<span class="main-row"><span class="icon">${icon}</span><span class="score rt-critics">${escapeHtml(rt.criticsScore)}%</span></span>`;
      }
      if (rt.audienceScore) {
        scoresHtml += `<span class="main-row"><span class="icon">🍿</span><span class="score rt-audience">${escapeHtml(rt.audienceScore)}%</span></span>`;
      }

      chip.innerHTML = `<div class="info">
        <span class="rt-logo">Rotten Tomatoes</span>
        <div class="rt-scores">${scoresHtml}</div>
      </div>`;

      chip.addEventListener("click", (e) => {
        e.preventDefault();
        console.log("[Ratings] RT click!", rtUrl);
        chrome.runtime.sendMessage({ type: "OPEN_TAB", url: rtUrl });
      });

      container.appendChild(chip);
    }
  }

  function positionBadge(host, title) {
    const titleEl = findTitleElement(title);
    if (titleEl) {
      titleEl.insertAdjacentElement("afterend", host);
      return true;
    }
    return false;
  }

  function injectBadge() {
    const title = getMovieTitleFromDocument();
    if (!title) return;

    const existingHost = document.getElementById("unext-ratings-host");
    if (title === lastTitle && existingHost) {
      if (existingHost.parentElement === document.body) {
        positionBadge(existingHost, title);
      }
      return;
    }

    removeBadge();
    lastTitle = title;

    const host = createBadge();

    if (!positionBadge(host, title)) {
      document.body.appendChild(host);
    }

    const year = getYearFromPage();
    console.log("[Ratings] Searching for:", title, "Year:", year);

    chrome.runtime.sendMessage(
      { type: "FETCH_ALL_SCORES", title, year },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("[Ratings] Runtime error:", chrome.runtime.lastError);
          updateBadge(host, { filmarks: { error: "runtime_error" } });
          return;
        }
        console.log("[Ratings] Response:", response);
        updateBadge(host, response || { filmarks: { error: "no_response" } });
      }
    );
  }

  function isDetailPage() {
    const url = location.href;
    if (/video\.unext\.jp\/title\/SID/.test(url)) return true;
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

  let debounceTimer = null;
  function debouncedCheck() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(checkPage, 500);
  }

  const observer = new MutationObserver(debouncedCheck);
  observer.observe(document.body, { childList: true, subtree: true });

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

  window.addEventListener("popstate", debouncedCheck);

  setTimeout(checkPage, 1000);
  setTimeout(checkPage, 3000);
})();
