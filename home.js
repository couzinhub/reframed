// assumes config.js, test.js, and shared.js are loaded before this script
// config.js provides: IMAGEKIT_URL_ENDPOINT, ARTWRK_R_CACHE, SEARCH_CACHE, HOMEPAGE_CSV_URL
// test.js provides: ART_CACHE_TK
// shared.js provides: fetchImagesForTag, fetchAllImageKitFiles, parseCSV, humanizePublicId, loadFromCache, saveToCache, showToast, mobile menu functionality

// ============ HOMEPAGE ROWS (SHEET PARSE) ============
//
// First row of HOMEPAGE_CSV_URL is assumed to be:
// "Tag","Label"

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

    const tagVal   = pick(rowArr, "tag");
    const labelVal = pick(rowArr, "label");

    if (!tagVal) continue;
    if (tagVal.toLowerCase().startsWith("-- ignore")) break;

    out.push({
      tag: tagVal,
      label: labelVal || tagVal
    });
  }

  return out;
}

// ============ IMAGE FETCH / IMAGE PICK ============
async function fetchImagesForHomepage(tagName) {
  // Use shared helper function (works with both Cloudinary and ImageKit)
  let items = await fetchImagesForTag(tagName);

  // newest first
  items = items.sort(
    (a, b) => (b.created_at || "").localeCompare(a.created_at || "")
  );

  return items;
}

function chooseFeaturedImage(row, images) {
  console.log('chooseFeaturedImage called for tag:', row.tag);
  console.log('Total images:', images.length);

  // First, always check for "thumbnail" tagged image (for both collections and artists)
  const thumbnailImage = images.find(img =>
    img.tags && img.tags.some(tag => tag.toLowerCase() === 'thumbnail')
  );

  if (thumbnailImage) {
    console.log('Found thumbnail image:', thumbnailImage.public_id);
    return thumbnailImage;
  }

  console.log('No thumbnail image found, using auto-select');

  // Filter out portrait images (height > width)
  const landscapeOrSquare = images.filter(img => img.width >= img.height);

  // Use filtered list if available, otherwise fall back to all images
  const finalList = landscapeOrSquare.length > 0 ? landscapeOrSquare : images;

  const selected = finalList.length > 0 ? finalList[0] : null;
  console.log('Auto-selected image:', selected ? selected.public_id : 'none');
  return selected;
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

  const img = document.createElement("img");
  img.loading = "lazy";
  img.src = tileData.chosen.thumbUrl;
  img.alt = tileData.chosen.niceTitle;

  const titleDiv = document.createElement("div");
  titleDiv.className = "title";
  titleDiv.textContent = tileData.row.label;

  tile.appendChild(img);
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

  // keep the first child of container (your header stuff), wipe the rest
  while (container.children.length > 1) {
    container.removeChild(container.lastChild);
  }

  renderGroupsInto(container, tilesArray);
}

// ============ RECENTLY ADDED SECTION ============

async function fetchRecentlyAdded() {
  try {
    // Fetch all files from ImageKit
    const allFiles = await fetchAllImageKitFiles();

    // Sort by upload date (newest first)
    const sorted = allFiles
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    // Transform to match expected format
    const items = sorted.map(file => ({
      public_id: file.filePath.substring(1), // Remove leading slash
      width: file.width,
      height: file.height,
      created_at: file.createdAt,
      tags: file.tags || []
    }));

    return items;
  } catch (err) {
    console.error('Error fetching recently uploaded:', err);
    return [];
  }
}

function renderRecentlyAdded(container, images) {
  if (!images || images.length === 0) return;

  const section = document.createElement("div");
  section.className = "recently-added-section";

  const title = document.createElement("h3");
  title.className = "recently-added-title";
  title.textContent = "Recently added";
  section.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "recently-added-grid";

  let currentIndex = 0;
  const itemsPerLoad = 10;

  function loadMore() {
    const endIndex = Math.min(currentIndex + itemsPerLoad, images.length);
    const batch = images.slice(currentIndex, endIndex);

    batch.forEach(img => {
      const publicId = img.public_id;
      const niceName = humanizePublicId(publicId);
      const card = createArtworkCard(publicId, niceName, img.tags, img.width, img.height);
      grid.appendChild(card);
    });

    currentIndex = endIndex;

    // Hide load more button if all items are loaded
    if (currentIndex >= images.length) {
      loadMoreBtn.style.display = "none";
    }
  }

  // Load initial batch
  loadMore();

  section.appendChild(grid);

  // Create load more button
  const loadMoreBtn = document.createElement("button");
  loadMoreBtn.className = "load-more-btn";
  loadMoreBtn.textContent = "Load more";
  loadMoreBtn.onclick = loadMore;

  // Hide button if all items are already loaded
  if (currentIndex >= images.length) {
    loadMoreBtn.style.display = "none";
  }

  section.appendChild(loadMoreBtn);
  container.appendChild(section);
}

// ============ MAIN BOOTSTRAP ============

(async function initHomepage() {
  const container = document.getElementById("homeView");

  // 1. Try to use cache if version matches
  const cached = loadHomepageCache(CACHE_VERSION);
  if (cached && Array.isArray(cached.tiles)) {
    renderFromTiles(container, cached.tiles);

    // Load recently added artworks (not cached)
    const recentImages = await fetchRecentlyAdded();
    renderRecentlyAdded(container, recentImages);
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

  // 5. Load recently added artworks
  const recentImages = await fetchRecentlyAdded();
  renderRecentlyAdded(container, recentImages);
})();
