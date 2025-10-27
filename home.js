// === CONFIG ===

const CLOUD_NAME = "dqqutqsna"; // <-- your Cloudinary cloud name

// Columns in your homepage sheet/tab:
// A: tag
// B: style ("hero" or "feature")
// C: label ("Van Gogh")
// D: featured_public_id (optional)
const HOMEPAGE_CSV_URL = "https://docs.google.com/spreadsheets/d/14TPNDckAz1iXVpGYnoiQYccHTj-fcdo-dbAw_R8l0GE/export?format=csv&gid=0";

// === UTILS ===

function buildThumbUrlWithWidth(publicId, width) {
  const transform = `c_fill,w_${width},q_auto,f_auto`;
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${transform}/${encodeURI(publicId)}`;
}

function buildFullUrl(publicId) {
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto/${encodeURI(publicId)}`;
}

function humanizePublicId(publicId) {
  let base = publicId.split("/").pop();
  return base
    .replace(/_/g, " ")
    .replace(/\s*-\s*reframed[\s_-]*[a-z0-9]+$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Load rows from the homepage sheet
// returns [{ tag, style, label, featuredPublicId }, ...] IN ORDER
async function loadHomepageRows() {
  const url = HOMEPAGE_CSV_URL + "&t=" + Date.now(); // cache-bust
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error("Could not load homepage sheet (HTTP " + res.status + ")");
  }

  const csvText = await res.text();
  const lines = csvText.split(/\r?\n/);

  const rows = [];

  for (const raw of lines) {
    if (!raw.trim()) continue;

    const parts = raw.split(",");

    // A=tag, B=style, C=label, D=featured_public_id
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

// Fetch newest landscape-or-square images for a tag
async function fetchLandscapeImagesForTag(tagName) {
  const listUrl = `https://res.cloudinary.com/${encodeURIComponent(CLOUD_NAME)}/image/list/${encodeURIComponent(tagName)}.json`;

  const res = await fetch(listUrl, { mode: "cors" });
  if (!res.ok) {
    throw new Error(`Tag "${tagName}" request failed (HTTP ${res.status})`);
  }

  const data = await res.json();

  let items = (data.resources || []).sort(
    (a, b) => (b.created_at || "").localeCompare(a.created_at || "")
  );

  // landscape or square only
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

// pick which resource to use for this row
function chooseFeaturedImage(row, images) {
  if (row.featuredPublicId) {
    const match = images.find(img => img.public_id === row.featuredPublicId);
    if (match) return match;
  }
  if (images.length > 0) {
    return images[0]; // newest landscape
  }
  return null;
}

// build a single <a class="tile ..."> element for a row definition
function buildTileElement(row, chosen) {
  const publicId = chosen.public_id;
  const prettyTitle = humanizePublicId(publicId);

  const width = row.style === "hero" ? 800 : 500;
  const thumbUrl = buildThumbUrlWithWidth(publicId, width);

  const tile = document.createElement("a");
  tile.className = `tile${row.style ? " " + row.style : ""}`;
  tile.href = `/?tag=${encodeURIComponent(row.tag)}`;
  tile.setAttribute("aria-label", row.label);

  const img = document.createElement("img");
  img.loading = "lazy";
  img.src = thumbUrl;
  img.alt = prettyTitle;

  const titleDiv = document.createElement("div");
  titleDiv.className = "title";
  titleDiv.textContent = row.label;

  tile.appendChild(img);
  tile.appendChild(titleDiv);

  return tile;
}

// NEW:
// Instead of splitting heroes/features globally, we walk your sheet rows
// and build logical groups like:
// heroRow = next hero
// feat1   = next feature after that hero
// feat2   = next feature after feat1
// That forms one "row group".
//
// We consume rows in order, so you control layout just by ordering the sheet.
function buildRowGroupsFromOrderedTiles(tiles) {
  const groups = [];
  let i = 0;

  while (i < tiles.length) {
    // 1. find the next hero
    if (tiles[i].row.style !== "hero") {
      i++;
      continue;
    }
    const heroTile = tiles[i];
    i++;

    // 2. find first feature after that
    let feature1 = null;
    while (i < tiles.length && !feature1) {
      if (tiles[i].row.style !== "hero") {
        feature1 = tiles[i];
      }
      i++;
    }

    // 3. find second feature after that
    let feature2 = null;
    while (i < tiles.length && !feature2) {
      if (tiles[i].row.style !== "hero") {
        feature2 = tiles[i];
      }
      i++;
    }

    // If we don't have two features, we can't form a full row,
    // so we stop.
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

// given the row groups, build DOM rows and alternate hero-left / hero-right
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
      // hero left
      rowDiv.appendChild(heroCol);
      rowDiv.appendChild(featsCol);
    } else {
      // hero right
      rowDiv.appendChild(featsCol);
      rowDiv.appendChild(heroCol);
    }

    container.appendChild(rowDiv);
    flip = 1 - flip;
  }
}

// MAIN FLOW
(async function initHomepage() {
  const container = document.getElementById("homeView");

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

  // 1. Resolve each row -> tile element
  const tiles = [];
  for (const row of rowsData) {
    try {
      const images = await fetchLandscapeImagesForTag(row.tag);
      if (!images.length) continue;

      const chosen = chooseFeaturedImage(row, images);
      if (!chosen) continue;

      const tileEl = buildTileElement(row, chosen);

      tiles.push({
        row, // {tag, style, label...}
        el: tileEl
      });
    } catch (err) {
      // Skip if this tag fails gracefully
      continue;
    }
  }

  // 2. Build groups of [hero + 2 features] respecting sheet order
  const groups = buildRowGroupsFromOrderedTiles(tiles);

  // 3. Render them into alternating rows
  renderGroupsInto(container, groups);
})();
