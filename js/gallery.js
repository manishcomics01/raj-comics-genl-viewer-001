
/*
 * gallery.js
 * Raj Comics GENL Viewer
 *
 * Features:
 * 1. Loads comics from data/comics.json
 * 2. Supports a JSON array or { "comics": [...] }
 * 3. Uses images[0] as the cover thumbnail
 * 4. Opens comics-viewer.html?comic=GENL-0001
 * 5. Search, sorting, pagination, and display settings
 * 6. Saves settings in localStorage
 * 7. Handles missing or invalid comic records safely
 */

(() => {
  "use strict";

  const CONFIG = window.COMIC_SITE_CONFIG || {};

  const DEFAULTS = {
    siteTitle: "Raj Comics",
    collectionTitle: "Raj Comics - GENL Collection",
    collectionLabel: "GENL COMIC SET",
    description: "Browse your collection and choose a comic to read.",
    footerText: "Raj Comics Collection",
    dataFile: "data/comics.json",
    viewerPage: "comics-viewer.html",
    pageSize: 48,
    defaults: {
      theme: "dark",
      cardSize: "medium",
      columns: "auto",
      imageFit: "contain",
      sort: "number",
      showSearch: true,
      showNumber: true,
      showTitle: true
    }
  };

  const SETTINGS_KEY = "rajComicsGallerySettings";

  const settings = {
    ...DEFAULTS.defaults,
    ...(CONFIG.defaults || {})
  };

  const state = {
    comics: [],
    filteredComics: [],
    currentPage: 1,
    searchTerm: "",
    sortOrder: settings.sort || "number"
  };

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  /*
   * Find an element using one of several possible IDs.
   * This helps the script work with minor HTML ID differences.
   */
  function findElement(...selectors) {
    for (const selector of selectors) {
      const element = $(selector);
      if (element) return element;
    }

    return null;
  }

  const elements = {
    siteTitle: findElement(
      "#site-title",
      "#siteTitle",
      "[data-site-title]"
    ),

    collectionTitle: findElement(
      "#collection-title",
      "#collectionTitle",
      "[data-collection-title]"
    ),

    collectionLabel: findElement(
      "#collection-label",
      "#collectionLabel",
      "[data-collection-label]"
    ),

    description: findElement(
      "#collection-description",
      "#description",
      "[data-description]"
    ),

    footer: findElement(
      "#footer-text",
      "#footerText",
      "[data-footer-text]"
    ),

    search: findElement(
      "#comic-search",
      "#search-input",
      "#searchInput",
      "#search"
    ),

    sort: findElement(
      "#sort-select",
      "#sortSelect",
      "#sort-order"
    ),

    grid: findElement(
      "#comic-grid",
      "#comics-grid",
      "#comicGrid",
      "#comicsGrid",
      "[data-comic-grid]"
    ),

    resultCount: findElement(
      "#result-count",
      "#resultCount",
      "#comic-count"
    ),

    pagination: findElement(
      "#pagination",
      "#pagination-container",
      "#paginationContainer"
    ),

    emptyMessage: findElement(
      "#empty-state",
      "#emptyMessage",
      "#no-comics"
    ),

    settingsButton: findElement(
      "#settings-button",
      "#settingsButton",
      "#open-settings"
    ),

    settingsPanel: findElement(
      "#settings-panel",
      "#settingsPanel",
      "#settings-drawer"
    ),

    settingsClose: findElement(
      "#settings-close",
      "#settingsClose",
      "#close-settings"
    )
  };

  /* -------------------------------------------------------
     Utility functions
  ------------------------------------------------------- */

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
      const replacements = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };

      return replacements[character];
    });
  }

  function safeLocalPath(path) {
    if (typeof path !== "string") return "";

    const value = path.trim();

    if (!value) return "";

    // Prevent unsafe schemes and external URLs.
    if (/^(?:javascript|data|vbscript):/i.test(value)) {
      return "";
    }

    if (/^(?:https?:)?\/\//i.test(value)) {
      return "";
    }

    // Prevent paths from escaping the website directory.
    if (value.split(/[\\/]/).includes("..")) {
      return "";
    }

    return value.replace(/\\/g, "/");
  }

  function naturalCompare(a, b) {
    return String(a).localeCompare(String(b), undefined, {
      numeric: true,
      sensitivity: "base"
    });
  }

  function showMessage(message, type = "info") {
    if (elements.grid) {
      elements.grid.innerHTML = `
        <div class="gallery-message gallery-message-${type}">
          ${escapeHTML(message)}
        </div>
      `;
    }

    if (elements.pagination) {
      elements.pagination.innerHTML = "";
    }

    if (elements.resultCount) {
      elements.resultCount.textContent = "";
    }
  }

  /* -------------------------------------------------------
     JSON loading and record normalization
  ------------------------------------------------------- */

  function extractRecords(data) {
    if (Array.isArray(data)) {
      return data;
    }

    if (!data || typeof data !== "object") {
      return null;
    }

    // Common JSON wrapper formats.
    const possibleKeys = [
      "comics",
      "records",
      "items",
      "data",
      "results"
    ];

    for (const key of possibleKeys) {
      if (Array.isArray(data[key])) {
        return data[key];
      }
    }

    return null;
  }

  function normalizeImages(record) {
    let images = record.images;

    // Also support common alternate image field names.
    if (images == null) {
      images =
        record.pages ??
        record.imageList ??
        record.image_list ??
        record.files ??
        [];
    }

    if (typeof images === "string") {
      images = [images];
    }

    if (!Array.isArray(images)) {
      return [];
    }

    return images
      .map(image => {
        if (typeof image === "string") {
          return safeLocalPath(image);
        }

        if (image && typeof image === "object") {
          const path =
            image.src ??
            image.path ??
            image.url ??
            image.file ??
            image.image;

          return safeLocalPath(path);
        }

        return "";
      })
      .filter(Boolean);
  }

  function normalizeComic(record, index) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return null;
    }

    const number = String(
      record.number ??
      record.comicNumber ??
      record.comic_number ??
      record.comicNo ??
      record.comic_no ??
      record.comicNumberText ??
      record.id ??
      ""
    ).trim();

    const title = String(
      record.title ??
      record.name ??
      record.comicName ??
      record.comic_name ??
      record.comicTitle ??
      ""
    ).trim();

    const images = normalizeImages(record);

    // Both a comic number and a title are required.
    if (!number || !title) {
      console.warn(
        `Skipping comic record ${index + 1}: missing number or title.`,
        record
      );

      return null;
    }

    // A record without images is retained, but shows a placeholder.
    return {
      ...record,
      number,
      title,
      year: record.year ?? null,
      set: record.set ?? "GENL",
      images
    };
  }

  async function loadComics() {
    const dataFile = CONFIG.dataFile || DEFAULTS.dataFile;

    try {
      const response = await fetch(dataFile, {
        cache: "no-cache"
      });

      if (!response.ok) {
        throw new Error(
          `Could not load ${dataFile}. HTTP status: ${response.status}`
        );
      }

      const data = await response.json();
      const records = extractRecords(data);

      if (!records) {
        console.error("Unexpected JSON structure:", data);

        throw new Error(
          'The JSON must be an array or an object containing a "comics", "records", "items", "data", or "results" array.'
        );
      }

      console.info(`Loaded ${records.length} raw comic records.`);

      if (records.length > 0) {
        console.debug("First comic record:", records[0]);
      }

      const normalized = records
        .map((record, index) => normalizeComic(record, index))
        .filter(Boolean);

      if (normalized.length === 0) {
        console.error(
          "No valid comic records found. Check the JSON field names.",
          records.slice(0, 5)
        );

        throw new Error(
          "No valid comic records found. Each record needs a comic number and a title. Check the browser console for the first records."
        );
      }

      state.comics = normalized;

      console.info(
        `Successfully prepared ${state.comics.length} comic records.`
      );

      return true;
    } catch (error) {
      console.error("Comic gallery loading error:", error);

      showMessage(
        error.message || "Unable to load the comic collection.",
        "error"
      );

      return false;
    }
  }

  /* -------------------------------------------------------
     Page headings and site information
  ------------------------------------------------------- */

  function updateSiteInformation() {
    const siteTitle = CONFIG.siteTitle || DEFAULTS.siteTitle;
    const collectionTitle =
      CONFIG.collectionTitle || DEFAULTS.collectionTitle;
    const collectionLabel =
      CONFIG.collectionLabel || DEFAULTS.collectionLabel;
    const description =
      CONFIG.description || DEFAULTS.description;
    const footerText =
      CONFIG.footerText || DEFAULTS.footerText;

    if (elements.siteTitle) {
      elements.siteTitle.textContent = siteTitle;
    }

    if (elements.collectionTitle) {
      elements.collectionTitle.textContent = collectionTitle;
    }

    if (elements.collectionLabel) {
      elements.collectionLabel.textContent = collectionLabel;
    }

    if (elements.description) {
      elements.description.textContent = description;
    }

    if (elements.footer) {
      elements.footer.textContent = footerText;
    }

    document.title = collectionTitle;
  }

  /* -------------------------------------------------------
     Viewer URL
  ------------------------------------------------------- */

  
function viewerURL(comic) {
    const viewerPage = CONFIG.viewerPage || DEFAULTS.viewerPage;

    if (!comic || !comic.number) {
        console.error("Cannot open viewer: comic number is missing.", comic);
        return null;
    }

    const url = new URL(viewerPage, window.location.href);

    url.searchParams.set("comic", comic.number);

    console.log("Opening comic:", comic.number);
    console.log("Viewer URL:", url.href);

    return url.href;
}


  /* -------------------------------------------------------
     Comic card rendering
  ------------------------------------------------------- */

  function renderCard(comic) {
    const cover = comic.images[0] || "";
    const number = comic.number;
    const title = comic.title;

    const showNumber = settings.showNumber !== false;
    const showTitle = settings.showTitle !== false;

    const numberHTML = showNumber
      ? `<div class="comic-number">${escapeHTML(number)}</div>`
      : "";

    const titleHTML = showTitle
      ? `<div class="comic-title">${escapeHTML(title)}</div>`
      : "";

    const imageHTML = cover
      ? `
        <img
          class="comic-cover"
          src="${escapeHTML(cover)}"
          alt="${escapeHTML(title)}"
          loading="lazy"
          decoding="async"
        >
      `
      : `
        <div class="comic-cover-placeholder">
          <span>No Cover</span>
        </div>
      `;

    return `
      <article class="comic-card" data-comic-number="${escapeHTML(number)}">
        <div class="comic-cover-wrapper">
          ${imageHTML}
        </div>

        <div class="comic-card-content">
          ${numberHTML}
          ${titleHTML}

          <button
            type="button"
            class="read-comic-button"
            data-action="read"
            data-comic-number="${escapeHTML(number)}"
          >
            Read Comic
          </button>
        </div>
      </article>
    `;
  }

  function renderGrid() {
    if (!elements.grid) {
      console.error(
        'Comic grid element not found. Add an element with id="comic-grid" to index.html.'
      );

      return;
    }

    const pageSize = Math.max(
      1,
      Number(CONFIG.pageSize || DEFAULTS.pageSize)
    );

    const total = state.filteredComics.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    state.currentPage = Math.min(
      Math.max(1, state.currentPage),
      totalPages
    );

    const startIndex = (state.currentPage - 1) * pageSize;

    const visibleComics = state.filteredComics.slice(
      startIndex,
      startIndex + pageSize
    );

    if (visibleComics.length === 0) {
      elements.grid.innerHTML = `
        <div class="gallery-message">
          No comics found. Try a different search.
        </div>
      `;
    } else {
      elements.grid.innerHTML = visibleComics
        .map(renderCard)
        .join("");
    }

    // Show a friendly message if a cover file is missing.
    $$(".comic-cover", elements.grid).forEach(image => {
      image.addEventListener("error", () => {
        const placeholder = document.createElement("div");
        placeholder.className = "comic-cover-placeholder";
        placeholder.textContent = "Cover Not Found";

        image.replaceWith(placeholder);
      }, { once: true });
    });

    updateResultCount(total, startIndex, visibleComics.length);
    renderPagination(totalPages);
  }

  function updateResultCount(total, startIndex, visibleCount) {
    if (!elements.resultCount) return;

    if (total === 0) {
      elements.resultCount.textContent = "No comics found";
      return;
    }

    const first = startIndex + 1;
    const last = startIndex + visibleCount;

    elements.resultCount.textContent =
      `Showing ${first}–${last} of ${total} comics`;
  }

  /* -------------------------------------------------------
     Pagination
  ------------------------------------------------------- */

  function renderPagination(totalPages) {
    if (!elements.pagination) return;

    if (totalPages <= 1) {
      elements.pagination.innerHTML = "";
      return;
    }

    const current = state.currentPage;
    const buttons = [];

    buttons.push(`
      <button
        type="button"
        class="page-button"
        data-page="${current - 1}"
        ${current === 1 ? "disabled" : ""}
        aria-label="Previous page"
      >Previous</button>
    `);

    let start = Math.max(1, current - 2);
    let end = Math.min(totalPages, current + 2);

    if (current <= 3) {
      end = Math.min(totalPages, 5);
    }

    if (current >= totalPages - 2) {
      start = Math.max(1, totalPages - 4);
    }

    if (start > 1) {
      buttons.push(`
        <button type="button" class="page-button" data-page="1">1</button>
      `);

      if (start > 2) {
        buttons.push(`<span class="page-ellipsis">…</span>`);
      }
    }

    for (let page = start; page <= end; page++) {
      buttons.push(`
        <button
          type="button"
          class="page-button ${page === current ? "active" : ""}"
          data-page="${page}"
          ${page === current ? 'aria-current="page"' : ""}
        >${page}</button>
      `);
    }

    if (end < totalPages) {
      if (end < totalPages - 1) {
        buttons.push(`<span class="page-ellipsis">…</span>`);
      }

      buttons.push(`
        <button
          type="button"
          class="page-button"
          data-page="${totalPages}"
        >${totalPages}</button>
      `);
    }

    buttons.push(`
      <button
        type="button"
        class="page-button"
        data-page="${current + 1}"
        ${current === totalPages ? "disabled" : ""}
        aria-label="Next page"
      >Next</button>
    `);

    elements.pagination.innerHTML = buttons.join("");
  }

  /* -------------------------------------------------------
     Search, sorting, and filtering
  ------------------------------------------------------- */

  function sortComics(comics) {
    const sorted = [...comics];

    switch (state.sortOrder) {
      case "title":
      case "title-asc":
        sorted.sort((a, b) => naturalCompare(a.title, b.title));
        break;

      case "title-desc":
        sorted.sort((a, b) => naturalCompare(b.title, a.title));
        break;

      case "number-desc":
        sorted.sort((a, b) => naturalCompare(b.number, a.number));
        break;

      case "year":
      case "year-asc":
        sorted.sort((a, b) =>
          naturalCompare(a.year ?? "", b.year ?? "")
        );
        break;

      case "year-desc":
        sorted.sort((a, b) =>
          naturalCompare(b.year ?? "", a.year ?? "")
        );
        break;

      case "number":
      case "number-asc":
      default:
        sorted.sort((a, b) => naturalCompare(a.number, b.number));
        break;
    }

    return sorted;
  }

  function applyFilters() {
    const query = state.searchTerm.trim().toLowerCase();

    let filtered = state.comics.filter(comic => {
      if (!query) return true;

      return (
        comic.number.toLowerCase().includes(query) ||
        comic.title.toLowerCase().includes(query) ||
        String(comic.year ?? "").toLowerCase().includes(query) ||
        String(comic.set ?? "").toLowerCase().includes(query)
      );
    });

    filtered = sortComics(filtered);

    state.filteredComics = filtered;
    state.currentPage = 1;

    renderGrid();
  }

  /* -------------------------------------------------------
     Settings persistence
  ------------------------------------------------------- */

  function saveSettings() {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify(settings)
      );
    } catch (error) {
      console.warn("Could not save gallery settings:", error);
    }
  }

  function loadSettings() {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);

      if (!saved) return;

      const parsed = JSON.parse(saved);

      if (parsed && typeof parsed === "object") {
        Object.assign(settings, parsed);
      }
    } catch (error) {
      console.warn("Could not read saved gallery settings:", error);
    }

    state.sortOrder = settings.sort || "number";
  }

  function applySettings() {
    const root = document.documentElement;

    root.dataset.theme = settings.theme || "dark";
    root.dataset.cardSize = settings.cardSize || "medium";
    root.dataset.columns = settings.columns || "auto";
    root.dataset.imageFit = settings.imageFit || "contain";

    // Also expose settings as classes for compatible CSS.
    document.body.classList.toggle(
      "theme-light",
      settings.theme === "light"
    );

    document.body.classList.toggle(
      "theme-dark",
      settings.theme !== "light"
    );

    document.body.classList.toggle(
      "hide-comic-number",
      settings.showNumber === false
    );

    document.body.classList.toggle(
      "hide-comic-title",
      settings.showTitle === false
    );

    if (elements.search) {
      const searchContainer =
        elements.search.closest(".search-container") ||
        elements.search.closest(".search-box") ||
        elements.search.parentElement;

      if (searchContainer) {
        searchContainer.hidden = settings.showSearch === false;
      }
    }

    syncSettingsControls();
  }

  function syncSettingsControls() {
    const controlMap = {
      theme: ["#theme-select", "#themeSelect"],
      cardSize: ["#card-size", "#cardSize", "#card-size-select"],
      columns: ["#columns-select", "#columnsSelect", "#grid-columns"],
      imageFit: ["#image-fit", "#imageFit", "#image-fit-select"],
      sort: ["#sort-select", "#sortSelect", "#sort-order"]
    };

    for (const [settingName, selectors] of Object.entries(controlMap)) {
      const control = findElement(...selectors);

      if (control && settings[settingName] != null) {
        control.value = settings[settingName];
      }
    }

    const checkboxMap = {
      showSearch: ["#show-search", "#showSearch"],
      showNumber: ["#show-number", "#showNumber"],
      showTitle: ["#show-title", "#showTitle"]
    };

    for (const [settingName, selectors] of Object.entries(checkboxMap)) {
      const control = findElement(...selectors);

      if (control && "checked" in control) {
        control.checked = settings[settingName] !== false;
      }
    }
  }

  function bindSettingsControls() {
    const controlMap = {
      theme: ["#theme-select", "#themeSelect"],
      cardSize: ["#card-size", "#cardSize", "#card-size-select"],
      columns: ["#columns-select", "#columnsSelect", "#grid-columns"],
      imageFit: ["#image-fit", "#imageFit", "#image-fit-select"]
    };

    for (const [settingName, selectors] of Object.entries(controlMap)) {
      const control = findElement(...selectors);

      if (!control) continue;

      control.addEventListener("change", () => {
        settings[settingName] = control.value;
        saveSettings();
        applySettings();
        renderGrid();
      });
    }

    const checkboxMap = {
      showSearch: ["#show-search", "#showSearch"],
      showNumber: ["#show-number", "#showNumber"],
      showTitle: ["#show-title", "#showTitle"]
    };

    for (const [settingName, selectors] of Object.entries(checkboxMap)) {
      const control = findElement(...selectors);

      if (!control) continue;

      control.addEventListener("change", () => {
        settings[settingName] = control.checked;
        saveSettings();
        applySettings();
        renderGrid();
      });
    }
  }

  /* -------------------------------------------------------
     Settings panel open / close
  ------------------------------------------------------- */

  function openSettings() {
    if (!elements.settingsPanel) return;

    elements.settingsPanel.hidden = false;
    elements.settingsPanel.classList.add("open");
    elements.settingsPanel.setAttribute("aria-hidden", "false");
  }

  function closeSettings() {
    if (!elements.settingsPanel) return;

    elements.settingsPanel.classList.remove("open");
    elements.settingsPanel.setAttribute("aria-hidden", "true");

    // Allow CSS transition to finish before hiding.
    window.setTimeout(() => {
      if (!elements.settingsPanel.classList.contains("open")) {
        elements.settingsPanel.hidden = true;
      }
    }, 250);
  }

  function bindSettingsPanel() {
    if (elements.settingsButton) {
      elements.settingsButton.addEventListener("click", openSettings);
    }

    if (elements.settingsClose) {
      elements.settingsClose.addEventListener("click", closeSettings);
    }

    if (elements.settingsPanel) {
      elements.settingsPanel.addEventListener("click", event => {
        if (
          event.target === elements.settingsPanel &&
          elements.settingsPanel.dataset.closeOnBackdrop === "true"
        ) {
          closeSettings();
        }
      });
    }

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeSettings();
      }
    });
  }

  /* -------------------------------------------------------
     Event listeners
  ------------------------------------------------------- */

  function bindSearch() {
    if (elements.search) {
      elements.search.addEventListener("input", () => {
        state.searchTerm = elements.search.value;
        applyFilters();
      });
    }

    if (elements.sort) {
      elements.sort.value = state.sortOrder;

      elements.sort.addEventListener("change", () => {
        state.sortOrder = elements.sort.value;
        settings.sort = state.sortOrder;
        saveSettings();
        applyFilters();
      });
    }
  }

  function bindGridActions() {
    if (elements.grid) {
      elements.grid.addEventListener("click", event => {
        const button = event.target.closest(
          '[data-action="read"], .read-comic-button'
        );

        if (!button) return;

        const number = button.dataset.comicNumber;

        const comic = state.comics.find(
          item => item.number === number
        );

        if (!comic) {
          console.error("Comic record not found:", number);
          return;
        }

        const url = viewerURL(comic);

if (url) {
    window.location.href = url;
}
      });
    }

    if (elements.pagination) {
      elements.pagination.addEventListener("click", event => {
        const button = event.target.closest("[data-page]");

        if (!button || button.disabled) return;

        const page = Number(button.dataset.page);

        if (!Number.isFinite(page) || page < 1) return;

        state.currentPage = page;
        renderGrid();

        window.scrollTo({
          top: 0,
          behavior: "smooth"
        });
      });
    }
  }

  /* -------------------------------------------------------
     Initialize gallery
  ------------------------------------------------------- */

  async function init() {
    updateSiteInformation();
    loadSettings();
    applySettings();

    bindSearch();
    bindGridActions();
    bindSettingsControls();
    bindSettingsPanel();

    const loaded = await loadComics();

    if (!loaded) return;

    applyFilters();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();