// assumes config.js is loaded first with:
// CLOUD_NAME, ARTISTS_CSV_URL

// ---------- lightweight in-tab cache ----------
let ARTISTS_CACHE = null; // [{ row, chosenImage }, ...]
let ARTISTS_SCROLL_Y = 0;

// cache for each tag's Cloudinary listing (thumb fetch)
const TAG_IMAGES_CACHE = {};
const TAG_TTL_MS = 5 * 60 * 1000; // 5 min

// cache for artist rows from the CSV
let ARTIST_ROWS_CACHE = null;
let ARTIST_ROWS_FETCHED_AT = 0;
const ROWS_TTL_MS = 5 * 60 * 1000; // 5 min

// ---------- CSV PARSER ----------
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

// ---------- LOAD ARTIST ROWS ----------
async function loadArtistRows() {
  // serve cached rows if still "fresh"
  if (
    ARTIST_ROWS_CACHE &&
    (Date.now() - ARTIST_ROWS_FETCHED_AT < ROWS_TTL_MS)
  ) {
    return ARTIST_ROWS_CACHE;
  }

  const res = await fetch(ARTISTS_CSV_URL + "&t=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load artist sheet: HTTP " + res.status);

  const csvText = await res.text();
  const rows = parseCSV(csvText);
  if (!rows.length) {
    ARTIST_ROWS_CACHE = [];
    ARTIST_ROWS_FETCHED_AT = Date.now();
    return [];
  }

  const header = rows[0].map(h => h.toLowerCase().trim());
  const tagCol = header.indexOf("tag");
  const labelCol = header.indexOf("label");
  const idCol = header.indexOf("featured public id");

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const tag = (r[tagCol] || "").trim();
    if (!tag || tag.toLowerCase().startsWith("-- ignore")) continue;

    out.push({
      tag,
      label: (r[labelCol] || tag).trim(),
      featuredPublicId: (r[idCol] || "").trim()
    });
  }

  ARTIST_ROWS_CACHE = out;
  ARTIST_ROWS_FETCHED_AT = Date.now();
  return out;
}

// ---------- CLOUDINARY HELPERS FOR THUMBS ----------
async function fetchImagesForTag(tagName) {
  // Check memory cache first
  const cached = TAG_IMAGES_CACHE[tagName];
  if (cached && (Date.now() - cached.lastFetched < TAG_TTL_MS)) {
    return { all: cached.all, landscape: cached.landscape };
  }

  // Fetch from Cloudinary
  const url = `https://res.cloudinary.com/${encodeURIComponent(CLOUD_NAME)}/image/list/${encodeURIComponent(tagName)}.json`;
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) {
    return { all: [], landscape: [] };
  }

  const data = await res.json();

  // newest first
  const all = (data.resources || []).sort((a, b) =>
    (b.created_at || "").localeCompare(a.created_at || "")
  );

  const landscape = all.filter(img => {
    const w = img.width;
    const h = img.height;
    return (typeof w === "number" && typeof h === "number") ? w >= h : true;
  });

  TAG_IMAGES_CACHE[tagName] = {
    all,
    landscape,
    lastFetched: Date.now()
  };

  return { all, landscape };
}

function pickFeaturedImage(row, imageSets) {
  const desired = (row.featuredPublicId || "").trim().toLowerCase();
  if (!desired) {
    return imageSets.landscape[0] || imageSets.all[0] || null;
  }

  function matches(img) {
    const id = (img.public_id || "").toLowerCase();
    return (
      id === desired ||
      id.startsWith(desired) ||
      id.endsWith(desired) ||
      id.includes(desired)
    );
  }

  const chosen = imageSets.all.find(matches);
  return chosen || imageSets.landscape[0] || imageSets.all[0] || null;
}

function humanizePublicId(publicId) {
  let base = publicId.split("/").pop();
  return base
    .replace(/_/g, " ")
    .replace(/\s*-\s*reframed[\s_-]*[a-z0-9]+$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ---------- RENDER ARTIST GRID ----------
function buildArtistCard(row, imgData) {
  // row: { tag, label, featuredPublicId }
  // imgData: chosenImage object OR null

  // Convert spaces to dashes for nicer URLs:
  // "Vincent Van Gogh" -> "Vincent-Van-Gogh"
  const dashedTag = row.tag.trim().replace(/\s+/g, "-");

  const card = document.createElement("a");
  card.className = "card artist";

  // use dashed tag in the URL instead of %20 encoding
  card.href = "/tag/#" + dashedTag;

  card.setAttribute("aria-label", row.label);

  // keep original tag (with spaces) in data-tag
  // we still need the real tag string elsewhere for Cloudinary lookups
  card.setAttribute("data-tag", row.tag);

  const thumbWrapper = document.createElement("div");
  thumbWrapper.className = "thumb";

  if (imgData) {
    const niceName = humanizePublicId(imgData.public_id);
    const thumbUrl = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/c_fill,w_600,q_auto,f_auto/${encodeURIComponent(imgData.public_id)}`;
    const imgEl = document.createElement("img");
    imgEl.loading = "lazy";
    imgEl.src = thumbUrl;
    imgEl.alt = niceName;
    thumbWrapper.appendChild(imgEl);
  } else {
    thumbWrapper.classList.add("placeholder");
  }

  card.appendChild(thumbWrapper);

  const labelEl = document.createElement("div");
  labelEl.className = "artist-name";
  labelEl.textContent = row.label;
  card.appendChild(labelEl);

  // Navigate for real (full page load to /tag/)
  // and remember scroll position in memory like you had
  card.addEventListener("click", (ev) => {
    ev.preventDefault();

    ARTISTS_SCROLL_Y = window.scrollY;

    const dashedTagNow = row.tag.trim().replace(/\s+/g, "-");
    const dest = "/tag/#" + dashedTagNow;
    window.location.href = dest;
  });

  return card;
}

function renderArtistsGrid(artistsList) {
  const grid = document.getElementById("artistsGrid");
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const artist of artistsList) {
    frag.appendChild(buildArtistCard(artist.row, artist.chosenImage));
  }
  grid.appendChild(frag);
}

function setupLazyThumbObserver() {
  const cards = document.querySelectorAll(".card");

  const obs = new IntersectionObserver(async (entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;

      const cardEl = entry.target;
      const tagName = cardEl.getAttribute("data-tag");
      if (!tagName) {
        observer.unobserve(cardEl);
        continue;
      }

      const cacheItem = ARTISTS_CACHE.find(a => a.row.tag === tagName);
      if (!cacheItem) {
        observer.unobserve(cardEl);
        continue;
      }

      // already has a chosen thumb?
      if (cacheItem.chosenImage) {
        observer.unobserve(cardEl);
        continue;
      }

      const imageSets = await fetchImagesForTag(tagName);
      const chosenImage = pickFeaturedImage(cacheItem.row, imageSets);
      cacheItem.chosenImage = chosenImage;

      const thumbWrapper = cardEl.querySelector(".thumb");
      if (thumbWrapper && chosenImage) {
        thumbWrapper.innerHTML = "";
        const niceName = humanizePublicId(chosenImage.public_id);
        const thumbUrl = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/c_fill,w_600,q_auto,f_auto/${encodeURIComponent(chosenImage.public_id)}`;
        const imgEl = document.createElement("img");
        imgEl.loading = "lazy";
        imgEl.src = thumbUrl;
        imgEl.alt = niceName;
        thumbWrapper.appendChild(imgEl);
        thumbWrapper.classList.remove("placeholder");
      }

      observer.unobserve(cardEl);
    }
  }, {
    root: null,
    rootMargin: "200px 0px 200px 0px",
    threshold: 0.01
  });

  cards.forEach(card => obs.observe(card));
}

// ---------- MAIN INIT ----------
(async function initArtistsPage() {
  const status = document.getElementById("artistsStatus");

  // If we've already got data in this tab, reuse it and restore scroll
  if (ARTISTS_CACHE && Array.isArray(ARTISTS_CACHE)) {
    renderArtistsGrid(ARTISTS_CACHE);
    setupLazyThumbObserver();
    window.scrollTo(0, ARTISTS_SCROLL_Y);
    status.textContent = "";
    return;
  }

  status.textContent = "Loading…";

  try {
    const rows = await loadArtistRows();

    ARTISTS_CACHE = rows.map(row => ({
      row,
      chosenImage: null
    }));

    renderArtistsGrid(ARTISTS_CACHE);
    setupLazyThumbObserver();

    status.textContent = ""; // no artist count
  } catch (err) {
    console.error(err);
    status.textContent = "Error loading artists: " + err.message;
  }
})();
