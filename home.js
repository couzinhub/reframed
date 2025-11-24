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

const RECENTLY_ADDED_CACHE_KEY = "reframed_recently_added_v1";

function loadRecentlyAddedCache() {
  try {
    const raw = localStorage.getItem(RECENTLY_ADDED_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed.savedAt || !parsed.items) return null;

    // Check TTL (use same as main cache)
    const age = Date.now() - parsed.savedAt;
    if (age > CACHE_TTL_MS) return null;

    return parsed.items;
  } catch {
    return null;
  }
}

function saveRecentlyAddedCache(items) {
  try {
    localStorage.setItem(RECENTLY_ADDED_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      items: items
    }));
  } catch {
    // Ignore quota errors
  }
}

async function fetchRecentlyAdded() {
  try {
    // Check cache first
    const cached = loadRecentlyAddedCache();
    if (cached) {
      return cached;
    }

    // Fetch all files from ImageKit
    const allFiles = await fetchAllImageKitFiles();

    // Sort by most recent activity (upload or update), newest first
    const sorted = allFiles
      .sort((a, b) => {
        // Get the most recent date for each file (either created or updated)
        const aDate = [a.createdAt, a.updatedAt].filter(Boolean).sort().reverse()[0] || "";
        const bDate = [b.createdAt, b.updatedAt].filter(Boolean).sort().reverse()[0] || "";
        return bDate.localeCompare(aDate);
      });

    // Take only the first 50 items and transform to expected format
    const recentItems = sorted.slice(0, 50).map(file => ({
      public_id: file.filePath.substring(1), // Remove leading slash
      file_id: file.fileId,
      width: file.width,
      height: file.height,
      created_at: file.createdAt,
      updated_at: file.updatedAt,
      tags: file.tags || []
    }));

    // Filter items that need version count check (updated > 1 hour after creation AND updated within last 12 days)
    const itemsNeedingVersionCheck = recentItems.filter(item => {
      if (!item.updated_at || !item.created_at) return false;

      const updatedDate = new Date(item.updated_at);
      const createdDate = new Date(item.created_at);

      const hoursSinceCreation = (updatedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60);
      const daysSinceUpdate = (Date.now() - updatedDate.getTime()) / (1000 * 60 * 60 * 24);

      return hoursSinceCreation > 1 && daysSinceUpdate <= 12;
    });

    // Fetch version counts only for items that need it
    const versionCounts = await Promise.all(
      itemsNeedingVersionCheck.map(item => fetchFileVersionCount(item.file_id))
    );

    // Map version counts back to items
    const versionCountMap = new Map();
    itemsNeedingVersionCheck.forEach((item, index) => {
      versionCountMap.set(item.file_id, versionCounts[index]);
    });

    // Add version_count to all items
    const finalItems = recentItems.map(item => ({
      ...item,
      version_count: versionCountMap.get(item.file_id) || 1
    }));

    // Save to cache
    saveRecentlyAddedCache(finalItems);

    return finalItems;
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
      const card = createArtworkCard(publicId, niceName, img.tags, img.width, img.height, img.updated_at, img.created_at, img.file_id, img.version_count);
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
  const pageLoader = document.getElementById("pageLoader");

  try {
    // 1. Try to use cache if version matches
    const cached = loadHomepageCache(CACHE_VERSION);
    if (cached && Array.isArray(cached.tiles)) {
      // Hide loader immediately - we have cached content
      if (pageLoader) {
        pageLoader.style.display = 'none';
      }

      renderFromTiles(container, cached.tiles);

      // Load recently added artworks (not cached)
      const recentImages = await fetchRecentlyAdded();
      renderRecentlyAdded(container, recentImages);

      return;
    }

    // 2. No valid cache → rebuild fresh (show loader)

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
          const thumbUrl = getThumbnailUrlWithCrop(publicId, thumbWidth, chosen.updated_at);

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
  } catch (error) {
    console.error('Error loading homepage:', error);
  } finally {
    // Always hide loader when done (success or error)
    if (pageLoader) {
      pageLoader.classList.add('hidden');
    }
  }
})();
