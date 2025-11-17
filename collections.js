// assumes config.js and shared.js are loaded first
// config.js provides: CLOUD_NAME, COLLECTIONS_CSV_URL
// shared.js provides: parseCSV, humanizePublicId, loadFromCache, saveToCache, showToast, mobile menu functionality

// ---------- lightweight in-tab cache ----------
let COLLECTIONS_CACHE = null;
let COLLECTIONS_SCROLL_Y = 0;

// cache for each tag's Cloudinary listing (thumb fetch)
const TAG_IMAGES_CACHE = {};
const TAG_TTL_MS = (window.DEBUG ? 2 : 20) * 60 * 1000;

// cache for collection rows from the CSV
let COLLECTION_ROWS_CACHE = null;
let COLLECTION_ROWS_FETCHED_AT = 0;
const ROWS_TTL_MS = 5 * 60 * 1000; // 5 min

// localStorage cache for collections page
const COLLECTIONS_LOCALSTORAGE_KEY = "reframed_collections_cache_v4";

// ---------- LOCALSTORAGE CACHE HELPERS ----------
function loadCollectionsFromLocalStorage() {
  try {
    const raw = localStorage.getItem(COLLECTIONS_LOCALSTORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    if (!parsed.savedAt || !Array.isArray(parsed.collections)) {
      return null;
    }

    const age = Date.now() - parsed.savedAt;
    if (age > CACHE_TTL_MS) {
      return null;
    }

    return parsed.collections;
  } catch {
    return null;
  }
}

function saveCollectionsToLocalStorage(collections) {
  try {
    localStorage.setItem(
      COLLECTIONS_LOCALSTORAGE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        collections: collections
      })
    );
  } catch {
    // ignore quota errors
  }
}

// ---------- LOAD COLLECTION ROWS ----------
async function loadCollectionRows() {
  // serve cached rows if still "fresh"
  if (
    COLLECTION_ROWS_CACHE &&
    (Date.now() - COLLECTION_ROWS_FETCHED_AT < ROWS_TTL_MS)
  ) {
    return COLLECTION_ROWS_CACHE;
  }

  // Fetch all files from ImageKit
  const files = await fetchAllImageKitFiles();

  // Extract collection tags (format: "collection - NAME")
  const collectionTagsSet = new Set();
  files.forEach(file => {
    if (file.tags && Array.isArray(file.tags)) {
      file.tags.forEach(tag => {
        const trimmedTag = tag.trim();
        if (trimmedTag.toLowerCase().startsWith('collection - ')) {
          collectionTagsSet.add(trimmedTag);
        }
      });
    }
  });

  // Convert to array and sort by the display name (without "collection - ")
  const collectionTags = Array.from(collectionTagsSet).sort((a, b) => {
    const nameA = a.substring(13); // Remove "collection - " (13 chars)
    const nameB = b.substring(13);
    return nameA.localeCompare(nameB);
  });

  // Create rows with tag (full) and label (without prefix)
  const out = collectionTags.map(tag => ({
    tag: tag, // Keep full tag for API queries
    label: tag.substring(13), // Remove "collection - " for display
    featuredPublicId: "" // Will be determined by lazy load
  }));

  COLLECTION_ROWS_CACHE = out;
  COLLECTION_ROWS_FETCHED_AT = Date.now();

  // Make globally available for tag page
  window.COLLECTION_ROWS = out;

  return out;
}

// ---------- IMAGE HELPERS FOR THUMBS ----------
async function fetchImagesForCollection(tagName) {
  // Check memory cache first
  const cached = TAG_IMAGES_CACHE[tagName];
  if (cached && (Date.now() - cached.lastFetched < TAG_TTL_MS)) {
    return {
      all: cached.all,
      count: cached.count
    };
  }

  // Use shared helper function from shared.js (works with both Cloudinary and ImageKit)
  const items = await fetchImagesForTag(tagName);

  // newest first
  const all = items.sort((a, b) =>
    (b.created_at || "").localeCompare(a.created_at || "")
  );

  const count = all.length;

  TAG_IMAGES_CACHE[tagName] = {
    all,
    count,
    lastFetched: Date.now()
  };

  return { all, count };
}

function pickFeaturedImage(row, imageSets) {
  const desired = (row.featuredPublicId || "").trim().toLowerCase();
  if (!desired) {
    return imageSets.all[0] || null;
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
  return chosen || imageSets.all[0] || null;
}

// ---------- RENDER COLLECTIONS GRID ----------
function buildCollectionCard(row, imgData) {
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
    const thumbUrl = getThumbnailUrlWithCrop(imgData.public_id, 700);
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
  const cacheItem = COLLECTIONS_CACHE
    ? COLLECTIONS_CACHE.find(c => c.row.tag === row.tag)
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
    COLLECTIONS_SCROLL_Y = window.scrollY;

    const prettyTag = row.tag.trim()
      .replace(/-/g, "%2D")
      .replace(/\s+/g, "-");
    const dest = "/tag/#" + prettyTag;
    window.location.href = dest;
  });

  return card;
}

function renderCollectionsGrid(collectionsList) {
  const grid = document.getElementById("collectionsGrid");
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const collection of collectionsList) {
    frag.appendChild(buildCollectionCard(collection.row, collection.chosenImage));
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

      const cacheItem = COLLECTIONS_CACHE.find(c => c.row.tag === tagName);
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
      const imageSets = await fetchImagesForCollection(tagName);

      // pick thumb if missing
      if (!alreadyHasThumb) {
        const chosenImage = pickFeaturedImage(cacheItem.row, imageSets);
        cacheItem.chosenImage = chosenImage;

        const thumbWrapper = cardEl.querySelector(".thumb");
        if (thumbWrapper && chosenImage) {
          thumbWrapper.innerHTML = "";
          const niceName = humanizePublicId(chosenImage.public_id);
          const thumbUrl = getThumbnailUrlWithCrop(chosenImage.public_id, 700);
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
(async function initCollectionsPage() {
  const status = document.getElementById("collectionsStatus");

  // If we've already got data in this tab, reuse it and restore scroll
  if (COLLECTIONS_CACHE && Array.isArray(COLLECTIONS_CACHE)) {
    // Make globally available for tag page
    window.COLLECTION_ROWS = COLLECTIONS_CACHE.map(c => c.row);
    renderCollectionsGrid(COLLECTIONS_CACHE);
    setupLazyThumbObserver();
    window.scrollTo(0, COLLECTIONS_SCROLL_Y);
    status.textContent = `${COLLECTIONS_CACHE.length} collections`;
    return;
  }

  // Try localStorage cache
  const cachedCollections = loadCollectionsFromLocalStorage();
  if (cachedCollections && Array.isArray(cachedCollections)) {
    COLLECTIONS_CACHE = cachedCollections;
    // Make globally available for tag page
    window.COLLECTION_ROWS = COLLECTIONS_CACHE.map(c => c.row);
    renderCollectionsGrid(COLLECTIONS_CACHE);
    setupLazyThumbObserver();
    status.textContent = `${COLLECTIONS_CACHE.length} collections`;
    return;
  }

  status.innerHTML = 'Loading<span class="spinner"></span>';

  try {
    const rows = await loadCollectionRows();

    COLLECTIONS_CACHE = rows.map(row => ({
      row,
      chosenImage: null,
      imageCount: null // will become a number after we load that tag
    }));

    // Save to localStorage
    saveCollectionsToLocalStorage(COLLECTIONS_CACHE);

    renderCollectionsGrid(COLLECTIONS_CACHE);
    setupLazyThumbObserver();

    status.textContent = `${COLLECTIONS_CACHE.length} collections`;
  } catch (err) {
    console.error(err);
    status.textContent = "Error loading collections: " + err.message;
  }
})();
