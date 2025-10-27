// === SETTINGS / TITLE LOADING ===

async function loadSettings() {
  const res = await fetch(SETTINGS_CSV_URL + "&t=" + Date.now());
  if (!res.ok) throw new Error("Cannot load settings sheet");

  const text = await res.text();
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l !== "");

  // assumes first row is headers: key,value
  const settings = {};
  for (const line of lines.slice(1)) {
    const firstComma = line.indexOf(",");
    if (firstComma === -1) continue;

    const rawKey = line.slice(0, firstComma);
    const rawVal = line.slice(firstComma + 1);

    const key = rawKey.replace(/^"(.*)"$/, "$1").trim();
    const value = rawVal.replace(/^"(.*)"$/, "$1").trim();

    if (!key) continue;
    settings[key] = value;
  }

  return settings;
}

async function applyHomepageTitle() {
  try {
    const settings = await loadSettings();
    const titleEl = document.getElementById("mainTitle");
    if (titleEl && settings.homepage_title) {
      titleEl.textContent = settings.homepage_title;
    }
  } catch (e) {
    console.warn("Couldn't load homepage title:", e.message);
  }
}


// === HOMEPAGE SHEET (TILES CONFIG) ===
// Sheet columns:
// A=tag, B=style, C=label, D=featured_public_id
// Row 1 is headers.

async function loadHomepageRows() {
  const url = HOMEPAGE_CSV_URL + "&t=" + Date.now(); // cache-bust
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error("Could not load homepage sheet (HTTP " + res.status + ")");
  }

  const csvText = await res.text();
  const lines = csvText
    .split(/\r?\n/)
    .filter(l => l.trim() !== "");

  const rows = [];

  // start from i=1 to skip header row
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const parts = raw.split(",");

    let tag    = (parts[0] || "").replace(/^"(.*)"$/, "$1").trim();
    let style  = (parts[1] || "").replace(/^"(.*)"$/, "$1").trim();
    let label  = (parts[2] || "").replace(/^"(.*)"$/, "$1").trim();
    let manual = (parts[3] || "").replace(/^"(.*)"$/, "$1").trim();

    if (!tag) continue;
    if (tag.toLowerCase().startsWith("-- ignore")) break;

    rows.push({
      tag,
      style: style || "",
      label: label || tag,
      featuredPublicId: manual || ""
    });
  }

  return rows;
}


// === CLOUDINARY FETCH + IMAGE PICKING ===

async function fetchLandscapeImagesForTag(tagName) {
  const listUrl = `https://res.cloudinary.com/${encodeURIComponent(CLOUD_NAME)}/image/list/${encodeURIComponent(tagName)}.json`;

  const res = await fetch(listUrl, { mode: "cors" });
  if (!res.ok) {
    console.warn(`Skipping tag "${tagName}" (HTTP ${res.status})`);
    return [];
  }

  const data = await res.json();

  // newest first
  let items = (data.resources || []).sort(
    (a, b) => (b.created_at || "").localeCompare(a.created_at || "")
  );

  // keep only non-portrait
  items = items.filter(img => {
    const w = img.width;
    const h = img.height;
    if (typeof w === "number" && typeof h === "number") {
      return w >= h; // width >= height
    }
    return true;
  });

  return items;
}

// prefer featuredPublicId if it exists in the set, else fallback to newest
function chooseFeaturedImage(row, images) {
  if (row.featuredPublicId) {
    const match = images.find(img => img.public_id === row.featuredPublicId);
    if (match) return match;
  }
  if (images.length > 0) {
    return images[0];
  }
  return null;
}

// Turn Cloudinary public_id into display name
// "De_la_Tour_-_The_Cheat_with_the_Ace_of_Clubs_-_reframed_qsiedq"
// -> "De la Tour - The Cheat with the Ace of Clubs"
function humanizePublicId(publicId) {
  let base = publicId.split("/").pop();
  return base
    .replace(/_/g, " ")
    .replace(/\s*-\s*reframed[\s_-]*[a-z0-9]+$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}


// === CACHE LOGIC FOR HOMEPAGE TILES ===

const HOMEPAGE_CACHE_KEY = "reframed_homepage_cache_v1";
const HOMEPAGE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function loadHomepageCache() {
  try {
    const raw = localStorage.getItem(HOMEPAGE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.savedAt || !Array.isArray(parsed.tiles)) return null;

    const age = Date.now() - parsed.savedAt;
    if (age > HOMEPAGE_CACHE_TTL_MS) return null;

    return parsed;
  } catch (e) {
    return null;
  }
}

function saveHomepageCache(payload) {
  try {
    localStorage.setItem(
      HOMEPAGE_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        ...payload
      })
    );
  } catch (e) {
    // ignore storage errors
  }
}


// === TILE / ROW BUILDING ===

// Build <a class="tile ..."> node from cached tile data
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

// Group tiles as hero + 2 features, in sheet order
// hero consumes next 2 non-hero entries
function buildRowGroupsFromOrderedTiles(tiles) {
  const groups = [];
  let i = 0;

  while (i < tiles.length) {
    // find next hero
    if (tiles[i].row.style !== "hero") {
      i++;
      continue;
    }
    const heroTile = tiles[i];
    i++;

    // first feature
    let feature1 = null;
    while (i < tiles.length && !feature1) {
      if (tiles[i].row.style !== "hero") {
        feature1 = tiles[i];
      }
      i++;
    }

    // second feature
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

// Add the groups to the DOM, alternating hero-left / hero-right
function renderGroupsInto(container, groups) {
  let flip = 0; // 0 = hero-left, 1 = hero-right

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

// Render tiles (from cache or freshly built) into the homepage <main>
// Keeps <h1 id="mainTitle"> intact.
function renderFromCachedTiles(container, tilesData) {
  // 1. Convert cached data to DOM tiles
  const tiles = tilesData.map(td => ({
    row: {
      tag: td.row.tag,
      style: td.row.style,
      label: td.row.label
    },
    el: buildTileElementFromCache(td)
  }));

  // 2. Group them into hero+2feature rows
  const groups = buildRowGroupsFromOrderedTiles(tiles);

  // 3. Clear any old rows but keep the first child (the title)
  while (container.children.length > 1) {
    container.removeChild(container.lastChild);
  }

  // 4. Append all rows
  renderGroupsInto(container, groups);
}


// === MAIN ENTRY POINT ===

(async function initHomepage() {
  const container = document.getElementById("homeView");

  // Step 1. Always load/apply homepage title
  await applyHomepageTitle();

  // Step 2. Try cache first
  const cached = loadHomepageCache();
  if (cached && Array.isArray(cached.tiles)) {
    renderFromCachedTiles(container, cached.tiles);
    return;
  }

  // Step 3. No cache (or expired) -> build fresh

  // 3a. Get configured rows from the homepage sheet
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

  // 3b. Fetch all tag image data in parallel for speed
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
        const thumbWidth = isHero ? 800 : 500;
        const thumbUrl = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/c_fill,w_${thumbWidth},q_auto,f_auto/${encodeURI(publicId)}`;

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
            linkHref: `/tag/#${encodeURIComponent(row.tag)}`
          }
        };
      } catch (err) {
        return null;
      }
    })
  );

  // 3c. Filter out nulls (rows with no usable image)
  const liveTiles = liveTilesResults.filter(Boolean);

  // 3d. Cache it for next time
  saveHomepageCache({ tiles: liveTiles });

  // 3e. Render it now
  renderFromCachedTiles(container, liveTiles);
})();
