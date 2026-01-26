// assumes config.js, test.js, and shared.js are loaded before this script
// config.js provides: IMAGEKIT_URL_ENDPOINT, ARTWRK_R_CACHE, SEARCH_CACHE, HOMEPAGE_CSV_URL
// test.js provides: ART_CACHE_TK
// shared.js provides: fetchImagesForTag, fetchAllImageKitFiles, parseCSV, humanizePublicId, loadFromCache, saveToCache, showToast, mobile menu functionality

// ============ HOMEPAGE ROWS (SHEET PARSE) ============
//
// First row of HOMEPAGE_CSV_URL is assumed to be:
// "Tag","Label","Thumbnail"

async function loadHomepageRows() {
  const res = await fetch(HOMEPAGE_CSV_URL, { cache: "default" });
  if (!res.ok) {
    throw new Error("Could not load homepage sheet (HTTP " + res.status + ")");
  }

  const csvText = await res.text();
  const rows = parseCSV(csvText);
  if (!rows.length) return [];

  const headerRow = rows[0];

  const colIndex = {};
  headerRow.forEach((raw, i) => {
    const key = (raw || "").toLowerCase().trim();
    if (key) colIndex[key] = i;
  });

  function pick(rowArr, ...possibleHeaders) {
    for (const name of possibleHeaders) {
      const idx = colIndex[name.toLowerCase()];
      if (idx !== undefined) {
        return (rowArr[idx] || "").trim();
      }
    }
    return "";
  }

  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const rowArr = rows[r];

    const tagVal       = pick(rowArr, "tag");
    const labelVal     = pick(rowArr, "label");
    const thumbnailVal = pick(rowArr, "thumbnail");

    if (!tagVal) continue;
    if (tagVal.toLowerCase().startsWith("-- ignore")) break;

    out.push({
      tag: tagVal,
      label: labelVal || tagVal,
      thumbnail: thumbnailVal || ""
    });
  }

  return out;
}

// ============ IMAGE FETCH / IMAGE PICK ============
async function fetchImagesForHomepage(tagName) {
  // Use shared helper function
  let items = await fetchImagesForTag(tagName);

  // newest first
  items = items.sort(
    (a, b) => (b.created_at || "").localeCompare(a.created_at || "")
  );

  return items;
}

function chooseFeaturedImage(row, images) {
  // First priority: custom thumbnail specified in the sheet
  if (row.thumbnail) {
    // Try to match by filename (e.g., "Walter Moras - Autumnal Woodland - reframed.jpg")
    const customImage = images.find(img => {
      const filename = img.public_id.split('/').pop(); // Get just the filename
      return filename === row.thumbnail;
    });

    if (customImage) {
      return customImage;
    }
  }

  // Second priority: check for "thumbnail" tagged image (for both collections and artists)
  const thumbnailImage = images.find(img =>
    img.tags && img.tags.some(tag => tag.toLowerCase() === 'thumbnail')
  );

  if (thumbnailImage) {
    return thumbnailImage;
  }

  // Filter out portrait images (height > width)
  const landscapeOrSquare = images.filter(img => img.width >= img.height);

  // Use filtered list if available, otherwise fall back to all images
  const finalList = landscapeOrSquare.length > 0 ? landscapeOrSquare : images;

  return finalList.length > 0 ? finalList[0] : null;
}

// ============ HOMEPAGE CACHE WITH VERSION CHECK ============

const HOMEPAGE_CACHE_KEY = "reframed_homepage_cache_v2"; // bumped so old v1 won't interfere

function loadHomepageCache(expectedVersion) {
  try {
    const raw = localStorage.getItem(HOMEPAGE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    // must have version, savedAt, and tiles array
    if (!parsed.savedAt || !Array.isArray(parsed.tiles) || !parsed.version) {
      return null;
    }

    // version mismatch? invalidate
    if (expectedVersion && parsed.version !== expectedVersion) {
      return null;
    }

    // TTL expired? invalidate
    const age = Date.now() - parsed.savedAt;
    if (age > CACHE_TTL_MS) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveHomepageCache(version, tiles) {
  try {
    localStorage.setItem(
      HOMEPAGE_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        version: version || "", // whatever we got from settings
        tiles: tiles
      })
    );
  } catch {
    // ignore quota errors
  }
}

// ============ TILE DOM / LAYOUT ============

function buildTileElementFromCache(tileData) {
  const tile = document.createElement("a");
  tile.className = "tile full-width";
  tile.href = tileData.chosen.linkHref;
  tile.setAttribute("aria-label", tileData.row.label);

  const imageWrapper = createImageWithLoading(
    tileData.chosen.public_id,
    tileData.chosen.thumbUrl,
    tileData.chosen.niceTitle
  );

  const titleDiv = document.createElement("div");
  titleDiv.className = "title";
  titleDiv.textContent = tileData.row.label;

  tile.appendChild(imageWrapper);
  tile.appendChild(titleDiv);

  return tile;
}

// Simple function that returns all tiles as-is
function buildRowGroupsFromOrderedTiles(tiles) {
  return tiles;
}

function renderGroupsInto(container, tiles) {
  const tilesContainer = document.createElement("div");
  tilesContainer.className = "homepage-tiles";

  // First tile gets special treatment
  if (tiles.length > 0) {
    tiles[0].el.classList.add("primary");
    tilesContainer.appendChild(tiles[0].el);
  }

  // Remaining tiles go in a row container
  if (tiles.length > 1) {
    const rowContainer = document.createElement("div");
    rowContainer.className = "secondary-row";

    for (let i = 1; i < tiles.length; i++) {
      tiles[i].el.classList.add("secondary");
      rowContainer.appendChild(tiles[i].el);
    }

    tilesContainer.appendChild(rowContainer);
  }

  // Add utility tiles as third row
  const utilityTiles = [
    { label: 'Search', href: '/search.html' },
    { label: 'FAQ', href: '/faq.html' },
    { label: 'Contact', href: '/contact.html' }
  ];

  const utilityRow = document.createElement("div");
  utilityRow.className = "utility-tiles-row";

  utilityTiles.forEach(tile => {
    const tileEl = document.createElement("a");
    tileEl.className = "tile utility";
    tileEl.href = tile.href;
    tileEl.setAttribute("aria-label", tile.label);

    const titleDiv = document.createElement("div");
    titleDiv.className = "title";
    titleDiv.textContent = tile.label;

    tileEl.appendChild(titleDiv);
    utilityRow.appendChild(tileEl);
  });

  tilesContainer.appendChild(utilityRow);

  container.appendChild(tilesContainer);
}

function renderFromTiles(container, tilesData) {
  const tiles = tilesData.map(td => ({
    row: {
      tag: td.row.tag,
      label: td.row.label
    },
    el: buildTileElementFromCache(td)
  }));

  const tilesArray = buildRowGroupsFromOrderedTiles(tiles);

  // Clear all children (including spinner)
  container.innerHTML = '';

  renderGroupsInto(container, tilesArray);
}

// ============ BROWSE TABS SECTION ============

function renderBrowseTabsSection(container) {
  const section = document.createElement("div");
  section.id = "browseTabsSection";
  section.className = "browse-tabs-section";

  // Tabs navigation container
  const tabsContainer = document.createElement("div");
  tabsContainer.id = "browseTabs";
  tabsContainer.className = "tabs-container";
  section.appendChild(tabsContainer);

  // Tab content wrapper
  const contentWrapper = document.createElement("div");
  contentWrapper.className = "tab-content-wrapper";

  // Recent tab (default)
  const recentContent = document.createElement("div");
  recentContent.id = "recentTabContent";
  recentContent.className = "tab-content active";
  const recentGrid = document.createElement("div");
  recentGrid.id = "recentGrid";
  recentGrid.className = "tag-grid";
  recentContent.appendChild(recentGrid);
  contentWrapper.appendChild(recentContent);

  // Collections tab
  const collectionsContent = document.createElement("div");
  collectionsContent.id = "collectionsTabContent";
  collectionsContent.className = "tab-content";
  const collectionsGrid = document.createElement("div");
  collectionsGrid.id = "collectionsGrid";
  collectionsGrid.className = "tag-grid";
  collectionsContent.appendChild(collectionsGrid);
  contentWrapper.appendChild(collectionsContent);

  // Artists tab
  const artistsContent = document.createElement("div");
  artistsContent.id = "artistsTabContent";
  artistsContent.className = "tab-content";
  const artistsGrid = document.createElement("div");
  artistsGrid.id = "artistsGrid";
  artistsGrid.className = "tag-grid";
  artistsContent.appendChild(artistsGrid);

  // Add alphabet navigation for artists
  const alphabetNav = createAlphabetNavigation();
  artistsContent.appendChild(alphabetNav);
  contentWrapper.appendChild(artistsContent);

  // Vertical tab
  const verticalContent = document.createElement("div");
  verticalContent.id = "verticalTabContent";
  verticalContent.className = "tab-content";
  const verticalGrid = document.createElement("div");
  verticalGrid.id = "verticalGrid";
  verticalGrid.className = "tag-grid";
  verticalContent.appendChild(verticalGrid);
  contentWrapper.appendChild(verticalContent);

  section.appendChild(contentWrapper);
  container.appendChild(section);
}

function createAlphabetNavigation() {
  const scrollbar = document.createElement("nav");
  scrollbar.className = "alphabet-scrollbar";

  for (let i = 65; i <= 90; i++) {
    const letter = String.fromCharCode(i);
    const marker = document.createElement("a");
    marker.className = "alphabet-marker";
    marker.href = `#section-${letter}`;
    marker.textContent = letter;
    marker.setAttribute("data-letter", letter);
    scrollbar.appendChild(marker);
  }

  return scrollbar;
}

// ============ MAIN BOOTSTRAP ============

(async function initHomepage() {
  const container = document.getElementById("homeView");

  // Show loading spinner
  container.innerHTML = '<div class="loading-spinner-container"><span class="spinner large"></span></div>';

  // 1. Try to use cache if version matches
  const cached = loadHomepageCache(CACHE_VERSION);
  if (cached && Array.isArray(cached.tiles)) {
    renderFromTiles(container, cached.tiles);

    // Render browse tabs section
    renderBrowseTabsSection(container);

    // Initialize browse tabs controller
    if (window.BrowseTabsController) {
      BrowseTabsController.init();
    }
    return;
  }

  // 2. No valid cache → rebuild fresh

  // Load rows from the Google Sheet
  const rowsData = await loadHomepageRows();

  const liveTilesResults = await Promise.all(
    rowsData.map(async (row) => {
      try {
        const images = await fetchImagesForHomepage(row.tag);
        if (!images.length) return null;

        const chosen = chooseFeaturedImage(row, images);
        if (!chosen) return null;

        const publicId = chosen.public_id;
        const niceTitle = humanizePublicId(publicId);

        const thumbWidth = 1400;
        const thumbUrl = getThumbnailUrlWithCrop(publicId, thumbWidth);

        // Convert spaces to dashes for pretty URLs, but encode hyphens as %2D
        const prettyTag = row.tag.trim()
          .replace(/-/g, "%2D")
          .replace(/\s+/g, "-");

        return {
          row: {
            tag: row.tag,
            label: row.label
          },
          chosen: {
            public_id: publicId,
            niceTitle: niceTitle,
            thumbWidth: thumbWidth,
            thumbUrl: thumbUrl,
            linkHref: `/tag/#${prettyTag}`
          }
        };
      } catch (err) {
        console.error(`Failed to fetch images for tag "${row.tag}":`, err);
        return null;
      }
    })
  );

  const liveTiles = liveTilesResults.filter(Boolean);

  // 3. Save to cache along with version
  saveHomepageCache(CACHE_VERSION, liveTiles);

  // 4. Render
  renderFromTiles(container, liveTiles);

  // 5. Render browse tabs section
  renderBrowseTabsSection(container);

  // 6. Initialize browse tabs controller
  if (window.BrowseTabsController) {
    BrowseTabsController.init();
  }
})();
