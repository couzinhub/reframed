// assumes config.js and shared.js are loaded first
// config.js provides: CLOUD_NAME, ARTISTS_CSV_URL
// shared.js provides: parseCSV, humanizePublicId, loadFromCache, saveToCache, showToast, mobile menu functionality

// ---------- lightweight in-tab cache ----------
let ARTISTS_CACHE = null; // [{ row, chosenImage }, ...]
let ARTISTS_SCROLL_Y = 0;

// cache for each tag's Cloudinary listing (thumb fetch)
const TAG_IMAGES_CACHE = {};
const TAG_TTL_MS = (window.DEBUG ? 2 : 20) * 60 * 1000;

// cache for artist rows from the CSV
let ARTIST_ROWS_CACHE = null;
let ARTIST_ROWS_FETCHED_AT = 0;
const ROWS_TTL_MS = 5 * 60 * 1000; // 5 min

// localStorage cache for artists page
const ARTISTS_LOCALSTORAGE_KEY = "reframed_artists_cache_v1";

// ---------- LOCALSTORAGE CACHE HELPERS ----------
function loadArtistsFromLocalStorage() {
  try {
    const raw = localStorage.getItem(ARTISTS_LOCALSTORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    if (!parsed.savedAt || !Array.isArray(parsed.artists)) {
      return null;
    }

    const age = Date.now() - parsed.savedAt;
    if (age > CACHE_TTL_MS) {
      return null;
    }

    return parsed.artists;
  } catch {
    return null;
  }
}

function saveArtistsToLocalStorage(artists) {
  try {
    localStorage.setItem(
      ARTISTS_LOCALSTORAGE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        artists: artists
      })
    );
  } catch {
    // ignore quota errors
  }
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
    return {
      all: cached.all,
      landscape: cached.landscape,
      count: cached.count
    };
  }

  // Fetch from Cloudinary
  const url = `https://res.cloudinary.com/${encodeURIComponent(CLOUD_NAME)}/image/list/${encodeURIComponent(tagName)}.json`;
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) {
    return { all: [], landscape: [], count: 0 };
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

  const count = all.length;

  TAG_IMAGES_CACHE[tagName] = {
    all,
    landscape,
    count,
    lastFetched: Date.now()
  };

  return { all, landscape, count };
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

// ---------- RENDER ARTIST GRID ----------
function buildArtistCard(row, imgData) {
  // row: { tag, label, featuredPublicId }

  // Convert spaces to dashes for pretty URLs, but encode hyphens as %2D
  // "John Lennon" -> "John-Lennon"
  // "Charles-François Daubigny" -> "Charles%2DFrançois-Daubigny"
  const prettyTag = row.tag.trim()
    .replace(/-/g, "%2D")  // Encode existing hyphens
    .replace(/\s+/g, "-");  // Convert spaces to dashes

  const card = document.createElement("a");
  card.className = "card artist";
  card.href = "/tag/#" + prettyTag;
  card.setAttribute("aria-label", row.label);
  card.setAttribute("data-tag", row.tag);

  const thumbWrapper = document.createElement("div");
  thumbWrapper.className = "thumb";

  if (imgData) {
    const niceName = humanizePublicId(imgData.public_id);
    const thumbUrl = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/c_fill,w_400,q_auto,f_auto/${encodeURIComponent(imgData.public_id)}`;
    const imgEl = document.createElement("img");
    imgEl.loading = "lazy";
    imgEl.src = thumbUrl;
    imgEl.alt = niceName;
    thumbWrapper.appendChild(imgEl);
  } else {
    thumbWrapper.classList.add("placeholder");
  }

  card.appendChild(thumbWrapper);

  // label with optional count
  const labelEl = document.createElement("div");
  labelEl.className = "artist-name";

  // try to find matching cache entry so we can pre-fill "(N)" on rerender
  const cacheItem = ARTISTS_CACHE
    ? ARTISTS_CACHE.find(a => a.row.tag === row.tag)
    : null;

  const countSpan = document.createElement("span");
  countSpan.className = "art-count";

  if (cacheItem && typeof cacheItem.imageCount === "number") {
    countSpan.textContent = `(${cacheItem.imageCount})`;
  } else {
    countSpan.textContent = "";
  }

  labelEl.textContent = row.label + " ";
  labelEl.appendChild(countSpan);

  card.__labelEl = labelEl;
  card.__countSpan = countSpan;
  card.appendChild(labelEl);

  // remember scroll position before navigating
  card.addEventListener("click", (ev) => {
    ev.preventDefault();
    ARTISTS_SCROLL_Y = window.scrollY;

    const prettyTag = row.tag.trim()
      .replace(/-/g, "%2D")
      .replace(/\s+/g, "-");
    const dest = "/tag/#" + prettyTag;
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

      // If we already have both thumb + count, nothing to do
      const alreadyHasThumb = !!cacheItem.chosenImage;
      const alreadyHasCount = typeof cacheItem.imageCount === "number";

      if (alreadyHasThumb && alreadyHasCount) {
        observer.unobserve(cardEl);
        continue;
      }

      // Fetch images (this gives us image list + count)
      const imageSets = await fetchImagesForTag(tagName);

      // pick thumb if missing
      if (!alreadyHasThumb) {
        const chosenImage = pickFeaturedImage(cacheItem.row, imageSets);
        cacheItem.chosenImage = chosenImage;

        const thumbWrapper = cardEl.querySelector(".thumb");
        if (thumbWrapper && chosenImage) {
          thumbWrapper.innerHTML = "";
          const niceName = humanizePublicId(chosenImage.public_id);
          const thumbUrl = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/c_fill,w_400,q_auto,f_auto/${encodeURIComponent(chosenImage.public_id)}`;
          const imgEl = document.createElement("img");
          imgEl.loading = "lazy";
          imgEl.src = thumbUrl;
          imgEl.alt = niceName;
          thumbWrapper.appendChild(imgEl);
          thumbWrapper.classList.remove("placeholder");
        }
      }

      // record count if missing
      if (!alreadyHasCount) {
        cacheItem.imageCount = imageSets.count;
      }

      // update label: "Name (N)"
      if (cardEl.__countSpan && typeof cacheItem.imageCount === "number") {
        cardEl.__countSpan.textContent = `(${cacheItem.imageCount})`;
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
    status.textContent = `${ARTISTS_CACHE.length} artists`;
    return;
  }

  // Try localStorage cache
  const cachedArtists = loadArtistsFromLocalStorage();
  if (cachedArtists && Array.isArray(cachedArtists)) {
    ARTISTS_CACHE = cachedArtists;
    renderArtistsGrid(ARTISTS_CACHE);
    setupLazyThumbObserver();
    status.textContent = `${ARTISTS_CACHE.length} artists`;
    return;
  }

  status.innerHTML = 'Loading<span class="spinner"></span>';

  try {
    const rows = await loadArtistRows();

    ARTISTS_CACHE = rows.map(row => ({
      row,
      chosenImage: null,
      imageCount: null // will become a number after we load that tag
    }));

    // Save to localStorage
    saveArtistsToLocalStorage(ARTISTS_CACHE);

    renderArtistsGrid(ARTISTS_CACHE);
    setupLazyThumbObserver();

    status.textContent = `${ARTISTS_CACHE.length} artists`;
  } catch (err) {
    console.error(err);
    status.textContent = "Error loading artists: " + err.message;
  }
})();
