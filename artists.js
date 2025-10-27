// assumes config.js is loaded BEFORE this script

// ---------- Utilities ----------

// safer CSV parser that respects quoted fields with commas
function parseCSV(text) {
  // returns an array of rows, where each row is an array of cells (strings)
  const rows = [];
  let current = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        // escaped double quote -> add a " and skip next
        value += '"';
        i++;
      } else if (ch === '"') {
        // end quote
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
        // ignore \r, we'll handle newline via \n
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

  // flush last line if it didn't end with \n
  if (value.length > 0 || inQuotes || current.length > 0) {
    current.push(value.trim());
    rows.push(current);
  }

  return rows;
}

function humanizePublicId(publicId) {
  let base = publicId.split("/").pop();
  return base
    .replace(/_/g, " ")
    .replace(/\s*-\s*reframed[\s_-]*[a-z0-9]+$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ---------- Cache ----------

const ARTISTS_CACHE_KEY = "reframed_artists_cache_v1";
const ARTISTS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function loadArtistsCache() {
  try {
    const raw = localStorage.getItem(ARTISTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.savedAt || !Array.isArray(parsed.artists)) return null;

    const age = Date.now() - parsed.savedAt;
    if (age > ARTISTS_CACHE_TTL_MS) return null;

    return parsed;
  } catch {
    return null;
  }
}

function saveArtistsCache(payload) {
  try {
    localStorage.setItem(
      ARTISTS_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        ...payload
      })
    );
  } catch {
    // ignore
  }
}

// ---------- Data loading from sheet ----------

async function loadArtistRows() {
  // Fetch CSV from the Artists sheet tab
  const url = ARTISTS_CSV_URL + "&t=" + Date.now(); // cache-bust Google
  const res = await fetch(url, { cache: "no-cache" });

  if (!res.ok) {
    throw new Error("Could not load artist sheet (HTTP " + res.status + ")");
  }

  const csvText = await res.text();
  const rows = parseCSV(csvText); // rows is [ [colA, colB,...], [..], ... ]

  if (!rows.length) return [];

  // first row is headers
  const headerRow = rows[0];

  // Build a map: header name -> index
  // We'll look for exact headers from your sheet:
  // "Tag (Artist name)", "Label (optional)", "Featured public ID"
  const colIndex = {};
  headerRow.forEach((colName, i) => {
    colIndex[colName] = i;
  });

  function cell(rowArr, headerName) {
    const idx = colIndex[headerName];
    if (idx === undefined) return "";
    return (rowArr[idx] || "").trim();
  }

  const out = [];

  for (let r = 1; r < rows.length; r++) {
    const rowArr = rows[r];

    const tagVal = cell(rowArr, "Tag (Artist name)");
    const labelVal = cell(rowArr, "Label (optional)");
    const featuredVal = cell(rowArr, "Featured public ID");

    // skip empty rows
    if (!tagVal) continue;
    if (tagVal.toLowerCase().starts_with?.("-- ignore") || tagVal.toLowerCase().startsWith("-- ignore")) {
      break;
    }

    out.push({
      tag: tagVal,
      label: labelVal || tagVal,
      featuredPublicId: featuredVal || ""
    });
  }

  return out;
}

// ---------- Cloudinary fetch ----------

async function fetchImagesForTag(tagName) {
  const url = `https://res.cloudinary.com/${encodeURIComponent(CLOUD_NAME)}/image/list/${encodeURIComponent(tagName)}.json`;

  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) {
    console.warn(`Skipping tag "${tagName}" (HTTP ${res.status})`);
    return [];
  }

  const data = await res.json();
  let items = (data.resources || []).sort(
    (a, b) => (b.created_at || "").localeCompare(a.created_at || "")
  );

  // only landscape/square for thumbnails
  items = items.filter(img => {
    const w = img.width;
    const h = img.height;
    return typeof w === "number" && typeof h === "number" ? w >= h : true;
  });

  return items;
}

function pickFeaturedImage(row, images) {
  if (row.featuredPublicId) {
    const match = images.find(img => img.public_id === row.featuredPublicId);
    if (match) return match;
  }
  return images[0] || null;
}

// ---------- Rendering ----------

function buildArtistCard(row, imgData) {
  const artistName = row.tag;

  const card = document.createElement("a");
  card.className = "artist-card";
  card.href = `/tag/#${encodeURIComponent(artistName)}`;
  card.setAttribute("aria-label", artistName);

  if (imgData) {
    const niceName = humanizePublicId(imgData.public_id);
    const thumbUrl = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/c_fill,w_600,q_auto,f_auto/${encodeURIComponent(imgData.public_id)}`;

    const imgEl = document.createElement("img");
    imgEl.loading = "lazy";
    imgEl.src = thumbUrl;
    imgEl.alt = niceName;
    card.appendChild(imgEl);
  }

  const labelEl = document.createElement("div");
  labelEl.className = "artist-name";
  labelEl.textContent = artistName;
  card.appendChild(labelEl);

  return card;
}

function renderArtistsGrid(artists) {
  const gridEl = document.getElementById("artistsGrid");
  const statusEl = document.getElementById("artistsStatus");

  gridEl.innerHTML = "";

  const frag = document.createDocumentFragment();
  for (const artist of artists) {
    frag.appendChild(buildArtistCard(artist.row, artist.chosenImage));
  }
  gridEl.appendChild(frag);

  statusEl.textContent = `${artists.length} artist${artists.length === 1 ? "" : "s"}`;
}

// ---------- Main flow ----------

async function initArtistsPage() {
  const statusEl = document.getElementById("artistsStatus");
  statusEl.textContent = "Loading…";

  // 1. Try cache
  const cached = loadArtistsCache();
  if (cached && Array.isArray(cached.artists)) {
    renderArtistsGrid(cached.artists);
    console.info("Loaded artists from cache");
    return;
  }

  // 2. Live load from sheet + Cloudinary
  let rows;
  try {
    rows = await loadArtistRows();
  } catch (err) {
    statusEl.textContent = "Couldn't load artist list: " + err.message;
    return;
  }

  const artistResults = await Promise.all(
    rows.map(async (row) => {
      const imgs = await fetchImagesForTag(row.tag);
      const chosenImage = pickFeaturedImage(row, imgs);
      return { row, chosenImage };
    })
  );

  // 3. Save cache
  saveArtistsCache({ artists: artistResults });

  // 4. Render
  renderArtistsGrid(artistResults);
}

initArtistsPage();
