// assumes config.js is loaded before this script so we have:
// CLOUD_NAME, HOMEPAGE_CSV_URL, SETTINGS_CSV_URL

// ============ CSV PARSER ============
function parseCSV(text) {
  const rows = [];
  let current = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        value += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        value += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        current.push(value.trim());
        value = "";
      } else if (ch === "\r") {
        // ignore
      } else if (ch === "\n") {
        current.push(value.trim());
        rows.push(current);
        current = [];
        value = "";
      } else {
        value += ch;
      }
    }
  }

  if (value.length > 0 || inQuotes || current.length > 0) {
    current.push(value.trim());
    rows.push(current);
  }

  return rows;
}

// ============ CACHE VERSION ============
// Cache version is now hardcoded - bump this when you want to invalidate cache
const CACHE_VERSION = "1";

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

// ============ CLOUDINARY FETCH / IMAGE PICK ============
async function fetchLandscapeImagesForTag(tagName) {
  const listUrl = `https://res.cloudinary.com/${encodeURIComponent(CLOUD_NAME)}/image/list/${encodeURIComponent(tagName)}.json`;

  const res = await fetch(listUrl, { mode: "cors" });
  if (!res.ok) {
    return [];
  }

  const data = await res.json();

  // newest first
  let items = (data.resources || []).sort(
    (a, b) => (b.created_at || "").localeCompare(a.created_at || "")
  );

  // filter out portrait for homepage
  items = items.filter(img => {
    const w = img.width;
    const h = img.height;
    if (typeof w === "number" && typeof h === "number") {
      return w >= h;
    }
    return true;
  });

  return items;
}

function chooseFeaturedImage(row, images) {
  if (row.featuredPublicId) {
    const match = images.find(img => img.public_id === row.featuredPublicId);
    if (match) return match;
  }
  return images.length > 0 ? images[0] : null;
}

function humanizePublicId(publicId) {
  let base = publicId.split("/").pop();
  return base
    .replace(/_/g, " ")
    .replace(/\s*-\s*reframed[\s_-]*[a-z0-9]+$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ============ HOMEPAGE CACHE WITH VERSION CHECK ============

const HOMEPAGE_CACHE_KEY = "reframed_homepage_cache_v2"; // bumped so old v1 won't interfere
const HOMEPAGE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

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
    if (age > HOMEPAGE_CACHE_TTL_MS) {
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
  tile.className = `tile${tileData.row.style ? " " + tileData.row.style : ""}`;
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

// ============ MAIN BOOTSTRAP ============

(async function initHomepage() {
  const container = document.getElementById("homeView");

  // 1. Try to use cache if version matches
  const cached = loadHomepageCache(CACHE_VERSION);
  if (cached && Array.isArray(cached.tiles)) {
    renderFromTiles(container, cached.tiles);
    return;
  }

  // 2. No valid cache → rebuild fresh

  let rowsData;
  try {
    rowsData = await loadHomepageRows();
  } catch (err) {
    const errBox = document.createElement("div");
    errBox.className = "error-msg";
    errBox.textContent = "Couldn't load homepage data: " + err.message;
    container.appendChild(errBox);
    return;
  }

  const liveTilesResults = await Promise.all(
    rowsData.map(async (row) => {
      try {
        const images = await fetchLandscapeImagesForTag(row.tag);
        if (!images.length) return null;

        const chosen = chooseFeaturedImage(row, images);
        if (!chosen) return null;

        const publicId = chosen.public_id;
        const niceTitle = humanizePublicId(publicId);

        const isHero = row.style === "hero";
        const thumbWidth = isHero ? 700 : 400;
        const thumbUrl = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/c_fill,w_${thumbWidth},q_auto,f_auto/${encodeURI(publicId)}`;

        // PRETTY URL HERE:
        // "Vincent Van Gogh" -> "Vincent-Van-Gogh"
        const dashedTag = row.tag.trim().replace(/\s+/g, "-");

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
            linkHref: `/tag/#${dashedTag}`
          }
        };
      } catch {
        return null;
      }
    })
  );

  const liveTiles = liveTilesResults.filter(Boolean);

  // 3. Save to cache along with version
  saveHomepageCache(CACHE_VERSION, liveTiles);

  // 4. Render
  renderFromTiles(container, liveTiles);
})();
