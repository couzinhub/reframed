// assumes config.js and shared.js are loaded first with:
// CLOUD_NAME
// shared.js provides: parseCSV, humanizePublicId, loadFromCache, saveToCache, showToast, mobile menu functionality

// ---------- TAG GALLERY CACHE ----------
const TAG_GALLERY_CACHE_KEY = "reframed_tag_gallery_cache_v1";

function loadTagGalleryCache(tagName) {
  try {
    const raw = localStorage.getItem(TAG_GALLERY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    if (!parsed.tags || typeof parsed.tags !== "object") {
      return null;
    }

    const tagCache = parsed.tags[tagName];
    if (!tagCache || !tagCache.savedAt || !Array.isArray(tagCache.images)) {
      return null;
    }

    const age = Date.now() - tagCache.savedAt;
    if (age > CACHE_TTL_MS) {
      return null;
    }

    return tagCache.images;
  } catch {
    return null;
  }
}

function saveTagGalleryCache(tagName, images) {
  try {
    let parsed = { tags: {} };
    const raw = localStorage.getItem(TAG_GALLERY_CACHE_KEY);
    if (raw) {
      try {
        parsed = JSON.parse(raw);
        if (!parsed.tags || typeof parsed.tags !== "object") {
          parsed = { tags: {} };
        }
      } catch {
        parsed = { tags: {} };
      }
    }

    parsed.tags[tagName] = {
      savedAt: Date.now(),
      images: images
    };

    localStorage.setItem(TAG_GALLERY_CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // ignore quota errors
  }
}

function getTagFromHash() {
  // Get the raw hash without #
  let raw = window.location.hash.replace(/^#/, "").trim();

  // Decode it - this handles both regular dashes AND %2D (encoded hyphens)
  try {
    raw = decodeURIComponent(raw);
  } catch {}

  // Now replace all remaining dashes with spaces
  // If there was a %2D in the URL, it's now a dash and will become a space
  // But we need the opposite - we want %2D to stay as a dash!

  // Better approach: work with the undecoded URL
  const urlHash = window.location.hash.replace(/^#/, "").trim();

  // Replace unencoded dashes with spaces, but keep %2D as dashes
  const tagName = urlHash
    .replace(/-/g, " ")  // Convert dashes to spaces
    .replace(/%2D/gi, "-");  // Convert %2D back to dashes

  // Now decode the result to handle other encoded chars
  try {
    return decodeURIComponent(tagName);
  } catch {
    return tagName;
  }
}

async function loadCollectionRowsIfNeeded() {
  // If already loaded, return
  if (window.COLLECTION_ROWS && Array.isArray(window.COLLECTION_ROWS)) {
    return;
  }

  // Load from CSV
  try {
    const res = await fetch(COLLECTIONS_CSV_URL + "&t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return;

    const csvText = await res.text();
    const rows = parseCSV(csvText);
    if (!rows.length) return;

    const header = rows[0].map(h => h.toLowerCase().trim());
    const tagCol = header.indexOf("tag");
    const labelCol = header.indexOf("label");
    const idCol = header.indexOf("image");

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

    window.COLLECTION_ROWS = out;
  } catch {
    // Silently fail - will fallback to tag name
  }
}

function getLabelForTag(tagName) {
  // Try to find the label from the collections data
  if (window.COLLECTION_ROWS && Array.isArray(window.COLLECTION_ROWS)) {
    const collection = window.COLLECTION_ROWS.find(
      row => row.tag.toLowerCase() === tagName.toLowerCase()
    );
    if (collection && collection.label) {
      return collection.label;
    }
  }
  // Fallback to tag name if no label found - capitalize first letter only
  return tagName.charAt(0).toUpperCase() + tagName.slice(1);
}

// Update meta tags for SEO
function updateMetaTags(tagName, displayName, imageCount) {
  const prettyTag = tagName.trim()
    .replace(/-/g, "%2D")
    .replace(/\s+/g, "-");

  const pageUrl = `https://reframed.gallery/tag/#${prettyTag}`;
  const pageTitle = `${displayName} - Reframed | Frame TV Art Gallery`;
  const pageDesc = `Browse ${imageCount} ${displayName.toLowerCase()} artworks optimized for Samsung Frame TV. High-quality images ready to download and display.`;

  // Update title
  const titleEl = document.getElementById("pageTitle");
  if (titleEl) titleEl.textContent = pageTitle;
  document.title = pageTitle;

  // Update description
  const descEl = document.getElementById("pageDescription");
  if (descEl) descEl.setAttribute("content", pageDesc);

  // Update keywords
  const keywordsEl = document.getElementById("pageKeywords");
  if (keywordsEl) {
    keywordsEl.setAttribute("content", `${displayName}, Frame TV art, Samsung Frame TV, ${tagName}, digital art gallery`);
  }

  // Update canonical
  const canonicalEl = document.getElementById("pageCanonical");
  if (canonicalEl) canonicalEl.setAttribute("href", pageUrl);

  // Update Open Graph
  const ogUrlEl = document.getElementById("ogUrl");
  if (ogUrlEl) ogUrlEl.setAttribute("content", pageUrl);

  const ogTitleEl = document.getElementById("ogTitle");
  if (ogTitleEl) ogTitleEl.setAttribute("content", pageTitle);

  const ogDescEl = document.getElementById("ogDescription");
  if (ogDescEl) ogDescEl.setAttribute("content", pageDesc);

  // Update Twitter
  const twitterUrlEl = document.getElementById("twitterUrl");
  if (twitterUrlEl) twitterUrlEl.setAttribute("content", pageUrl);

  const twitterTitleEl = document.getElementById("twitterTitle");
  if (twitterTitleEl) twitterTitleEl.setAttribute("content", pageTitle);

  const twitterDescEl = document.getElementById("twitterDescription");
  if (twitterDescEl) twitterDescEl.setAttribute("content", pageDesc);
}


async function fetchImagesForTagPage(tagName) {
  let items;

  // Special case: "Vertical artworks" fetches ALL images (no tag filter)
  if (tagName === "Vertical artworks") {
    items = await fetchAllImageKitFiles();
    // Transform to match expected format
    items = items.map(file => ({
      public_id: file.filePath.substring(1), // Remove leading slash
      width: file.width,
      height: file.height,
      created_at: file.createdAt
    }));
  } else {
    // Use shared helper function from shared.js for tag-based queries
    items = await fetchImagesForTag(tagName);
  }

  if (!items || items.length === 0) {
    throw new Error(`Tag "${tagName}" not found`);
  }

  // sort newest first
  return items.sort(
    (a, b) => (b.created_at || "").localeCompare(a.created_at || "")
  );
}

function renderTagGallery(tagName, images) {
  const tagTitleEl = document.getElementById("tagTitle");
  const tagStatusEl = document.getElementById("tagStatus");
  const tagGridEl = document.getElementById("tagGrid");

  // Get the display label from collections data, or fallback to tag name
  const displayName = getLabelForTag(tagName);
  tagTitleEl.textContent = displayName;

  // Update SEO meta tags
  updateMetaTags(tagName, displayName, images.length);

  tagStatusEl.textContent = `${images.length} artwork${images.length === 1 ? "" : "s"}`;

  tagGridEl.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (const img of images) {
    const publicId = img.public_id;
    const niceName = humanizePublicId(publicId);

    const w = img.width;
    const h = img.height;
    const isPortrait =
      typeof w === "number" &&
      typeof h === "number" &&
      h > w;

    // Use 400px for portraits on Vertical artworks page, 600px for everything else
    const thumbWidth = (tagName === "Vertical artworks" && isPortrait) ? 400 : 600;

    const card = document.createElement("div");
    card.className = "card artwork";
    card.dataset.publicId = publicId;

    const imageUrl = getImageUrl(publicId);

    // Add click handler to toggle downloads queue
    card.addEventListener('click', (e) => {
      e.preventDefault();

      if (typeof window.isInDownloads === 'function' && typeof window.addToDownloads === 'function') {
        if (window.isInDownloads(publicId)) {
          window.removeFromDownloads(publicId);
        } else {
          window.addToDownloads(publicId, niceName, imageUrl, isPortrait ? 'portrait' : 'landscape');
        }
      }
    });

    // Set initial state if in downloads
    if (typeof window.isInDownloads === 'function' && window.isInDownloads(publicId)) {
      card.classList.add('in-downloads');
    }

    const imgEl = document.createElement("img");
    imgEl.loading = "lazy";
    imgEl.src = getThumbnailUrl(publicId, thumbWidth);
    imgEl.alt = niceName;

    const caption = document.createElement("div");
    caption.className = "artwork-title";
    caption.textContent = niceName;

    card.appendChild(imgEl);
    card.appendChild(caption);
    frag.appendChild(card);
  }

  tagGridEl.appendChild(frag);
}

async function loadAndRenderTagPage() {
  const tagViewEl = document.getElementById("tagView");
  const tagTitleEl = document.getElementById("tagTitle");
  const tagStatusEl = document.getElementById("tagStatus");
  const tagGridEl = document.getElementById("tagGrid");

  tagGridEl.innerHTML = "";

  // This will now return "Vincent Van Gogh" for "#Vincent-Van-Gogh"
  const tagName = getTagFromHash();

  if (!tagName) {
    tagTitleEl.textContent = "No tag selected";
    tagStatusEl.textContent = "";
    tagViewEl.classList.remove("vertical");
    document.title = "Reframed — Gallery";
    return;
  }

  // Load collection rows to get labels if not already loaded
  await loadCollectionRowsIfNeeded();

  const displayName = getLabelForTag(tagName);
  tagTitleEl.textContent = displayName;
  document.title = displayName + " – Reframed";

  // Try cache first
  const cachedImages = loadTagGalleryCache(tagName);
  if (cachedImages && Array.isArray(cachedImages)) {
    // Special layout rule
    if (tagName === "Vertical artworks") {
      tagViewEl.classList.add("vertical");
    } else {
      tagViewEl.classList.remove("vertical");
    }

    renderTagGallery(tagName, cachedImages);
    return;
  }

  tagStatusEl.innerHTML = 'Loading<span class="spinner"></span>';

  try {
    const images = await fetchImagesForTagPage(tagName);

    // Special layout rule
    if (tagName === "Vertical artworks") {
      tagViewEl.classList.add("vertical");
    } else {
      tagViewEl.classList.remove("vertical");
    }

    // Filter by orientation (only for Vertical artworks page)
    const filtered =
      tagName === "Vertical artworks"
        ? images.filter(img => {
            // Show only portrait images
            const w = img.width;
            const h = img.height;
            return (typeof w === "number" && typeof h === "number")
              ? (h > w)
              : false;
          })
        : images; // Show all images regardless of orientation

    if (!filtered.length) {
      tagStatusEl.textContent = "No artworks found.";
      tagGridEl.innerHTML = "";
    } else {
      // Save to cache
      saveTagGalleryCache(tagName, filtered);
      renderTagGallery(tagName, filtered);
    }
  } catch (err) {
    console.error(err);
    tagStatusEl.textContent = `Error: ${err.message}`;
    tagGridEl.innerHTML = "";
    tagViewEl.classList.remove("vertical");
  }
}

// run once
loadAndRenderTagPage();

// run again when hash changes (#Vincent-Van-Gogh -> #Edgar-Degas etc.)
window.addEventListener("hashchange", loadAndRenderTagPage);
