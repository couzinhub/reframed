// assumes config.js, test.js, and shared.js are loaded before this script
// config.js provides: IMAGEKIT_URL_ENDPOINT, ARTWRK_R_CACHE, SEARCH_CACHE, HOMEPAGE_CSV_URL
// test.js provides: ART_CACHE_TK
// shared.js provides: fetchImagesForTag, fetchAllImageKitFiles, parseCSV, humanizePublicId, loadFromCache, saveToCache, showToast, mobile menu functionality

// ============ HOMEPAGE ROWS (SHEET PARSE) ============
//
// First row of HOMEPAGE_CSV_URL is assumed to be:
// "Tag","Style","Label","Image"
//
// Style can be "hero" or blank.
// Image is the Cloudinary public_id override.

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
    const styleVal = pick(rowArr, "style", "size");
    const labelVal = pick(rowArr, "label");
    const imgVal   = pick(rowArr, "image", "featured_public_id", "featured public id");

    if (!tagVal) continue;
    if (tagVal.toLowerCase().startsWith("-- ignore")) break;

    out.push({
      tag: tagVal,
      style: styleVal || "",
      label: labelVal || tagVal,
      featuredPublicId: imgVal || ""
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
  if (row.featuredPublicId) {
    const match = images.find(img => img.public_id === row.featuredPublicId);
    if (match) return match;
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
  const styleClass = tileData.row.style === "hero" ? "hero" : "feature";
  tile.className = `tile ${styleClass}`;
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

// same hero + 2 features per hero logic
function buildRowGroupsFromOrderedTiles(tiles) {
  const groups = [];
  let i = 0;

  while (i < tiles.length) {
    if (tiles[i].row.style !== "hero") {
      i++;
      continue;
    }

    const heroTile = tiles[i];
    i++;

    let feature1 = null;
    while (i < tiles.length && !feature1) {
      if (tiles[i].row.style !== "hero") {
        feature1 = tiles[i];
      }
      i++;
    }

    let feature2 = null;
    while (i < tiles.length && !feature2) {
      if (tiles[i].row.style !== "hero") {
        feature2 = tiles[i];
      }
      i++;
    }

    if (!feature1 || !feature2) {
      break;
    }

    groups.push({
      hero: heroTile,
      featureTop: feature1,
      featureBottom: feature2
    });
  }

  return groups;
}

function renderGroupsInto(container, groups) {
  let flip = 0;

  for (const g of groups) {
    const rowDiv = document.createElement("div");
    rowDiv.className = "row " + (flip === 0 ? "hero-left" : "hero-right");

    const heroCol = document.createElement("div");
    heroCol.className = "hero-col";
    heroCol.appendChild(g.hero.el);

    const featsCol = document.createElement("div");
    featsCol.className = "features-col";

    const featTop = document.createElement("div");
    featTop.className = "feature-top";
    featTop.appendChild(g.featureTop.el);

    const featBottom = document.createElement("div");
    featBottom.className = "feature-bottom";
    featBottom.appendChild(g.featureBottom.el);

    featsCol.appendChild(featTop);
    featsCol.appendChild(featBottom);

    if (flip === 0) {
      rowDiv.appendChild(heroCol);
      rowDiv.appendChild(featsCol);
    } else {
      rowDiv.appendChild(featsCol);
      rowDiv.appendChild(heroCol);
    }

    container.appendChild(rowDiv);
    flip = 1 - flip;
  }
}

function renderFromTiles(container, tilesData) {
  const tiles = tilesData.map(td => ({
    row: {
      tag: td.row.tag,
      style: td.row.style,
      label: td.row.label
    },
    el: buildTileElementFromCache(td)
  }));

  const groups = buildRowGroupsFromOrderedTiles(tiles);

  // keep the first child of container (your header stuff), wipe the rest
  while (container.children.length > 1) {
    container.removeChild(container.lastChild);
  }

  renderGroupsInto(container, groups);
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

  // Fetch all files to discover available tags
  const allFiles = await fetchAllImageKitFiles();

  // Collect all unique tags (excluding "Collection - " tags)
  const tagCounts = {};
  allFiles.forEach(file => {
    if (file.tags && Array.isArray(file.tags)) {
      file.tags.forEach(tag => {
        if (!tag.toLowerCase().startsWith('collection - ')) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      });
    }
  });

  // Get top 3 tags by count (1 hero + 2 features = 1 row)
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag, count]) => tag);

  // Build rowsData with hero/feature pattern
  const rowsData = topTags.map((tag, i) => ({
    tag: tag,
    style: i === 0 ? "hero" : "",
    label: tag,
    featuredPublicId: ""
  }));

  const liveTilesResults = await Promise.all(
    rowsData.map(async (row) => {
      try {
        const images = await fetchImagesForHomepage(row.tag);
        if (!images.length) return null;

        const chosen = chooseFeaturedImage(row, images);
        if (!chosen) return null;

        const publicId = chosen.public_id;
        const niceTitle = humanizePublicId(publicId);

        const isHero = row.style === "hero";
        const thumbWidth = 700;
        const thumbUrl = getThumbnailUrlWithCrop(publicId, thumbWidth);

        // Convert spaces to dashes for pretty URLs, but encode hyphens as %2D
        const prettyTag = row.tag.trim()
          .replace(/-/g, "%2D")
          .replace(/\s+/g, "-");

        return {
          row: {
            tag: row.tag,
            style: row.style,
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
