(() => {
  const STORAGE_KEY = "geomacro.website_language";
  const LANGUAGES = [
    ["en", "English"], ["es", "Español"], ["fr", "Français"], ["de", "Deutsch"],
    ["pt", "Português"], ["zh-CN", "简体中文"], ["zh-TW", "繁體中文"], ["ja", "日本語"],
    ["ko", "한국어"], ["hi", "हिन्दी"], ["bn", "বাংলা"], ["ar", "العربية"],
    ["ru", "Русский"], ["tr", "Türkçe"], ["id", "Bahasa Indonesia"],
  ];
  const CODE_SET = new Set(LANGUAGES.map(([code]) => code));

  function cleanQuery(url) {
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("_x_tr_")) url.searchParams.delete(key);
    }
    return url;
  }

  function sourceUrl() {
    const current = new URL(window.location.href);
    if (current.hostname === "translate.google.com") {
      const embedded = current.searchParams.get("u");
      if (embedded) {
        try { return cleanQuery(new URL(embedded)).toString(); } catch {}
      }
    }
    if (current.hostname.endsWith(".translate.goog")) {
      const original = new URL(`${window.location.protocol}//geomacro.live${current.pathname}${current.search}`);
      original.hash = current.hash;
      return cleanQuery(original).toString();
    }
    return cleanQuery(current).toString();
  }

  function activeLanguage() {
    const current = new URL(window.location.href);
    const translated = current.searchParams.get("_x_tr_tl") || current.searchParams.get("tl");
    if (translated && CODE_SET.has(translated)) return translated;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored && CODE_SET.has(stored) ? stored : "en";
    } catch {
      return "en";
    }
  }

  function remember(code) {
    try { localStorage.setItem(STORAGE_KEY, code); } catch {}
  }

  function navigate(code) {
    if (!CODE_SET.has(code)) return;
    remember(code);
    const source = new URL(sourceUrl());
    if (code === "en") {
      window.location.assign(source.toString());
      return;
    }

    // Use the supported Google Translate website endpoint. The former
    // translated-host construction depended on a proxy hostname remaining
    // reachable and could silently leave some visitors on an untranslated page.
    // The single-controller fix prevents the old competing-navigation race;
    // pass the complete canonical URL so deep paths, query and fragments survive.
    const translated = new URL("https://translate.google.com/translate");
    translated.searchParams.set("sl", "auto");
    translated.searchParams.set("tl", code);
    translated.searchParams.set("hl", "en");
    translated.searchParams.set("u", source.toString());
    window.location.assign(translated.toString());
  }

  function syncSelect(select) {
    if (!(select instanceof HTMLSelectElement)) return;
    const code = activeLanguage();
    if ([...select.options].some((option) => option.value === code)) select.value = code;
  }

  function bindSelect(select) {
    if (!(select instanceof HTMLSelectElement) || select.dataset.geomacroLanguageBound === "1") return;
    select.dataset.geomacroLanguageBound = "1";
    syncSelect(select);
    select.addEventListener("change", (event) => {
      event.stopImmediatePropagation();
      navigate(String(select.value || "en"));
    });
  }

  function injectStandaloneSelector() {
    if (document.querySelector("#languageSelect,[data-geomacro-language-control]")) return;
    if (window.location.pathname !== "/arc-microgrant.html") return;
    const wrap = document.createElement("div");
    wrap.dataset.geomacroLanguageControl = "1";
    wrap.style.cssText = "position:fixed;right:16px;top:16px;z-index:9999";
    const select = document.createElement("select");
    select.id = "languageSelect";
    select.setAttribute("aria-label", "Language");
    select.style.cssText = "border:1px solid #33405a;border-radius:999px;background:#0e121a;color:#f5f7fb;padding:8px 30px 8px 12px;font:12px ui-monospace,monospace";
    for (const [code, label] of LANGUAGES) {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = label;
      select.appendChild(option);
    }
    wrap.appendChild(select);
    document.body.appendChild(wrap);
    bindSelect(select);
  }

  function bindAll() {
    document.querySelectorAll("#languageSelect,.geomacro-language-select").forEach(bindSelect);
    injectStandaloneSelector();
  }

  document.addEventListener("DOMContentLoaded", bindAll);
  const observer = new MutationObserver(() => bindAll());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.GeomacroLanguage = Object.freeze({ languages: LANGUAGES, activeLanguage, sourceUrl, navigate });
})();
