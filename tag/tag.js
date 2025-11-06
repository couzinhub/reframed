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
  let raw = window.location.hash.replace(/^#/, "").trim();
  try {
    raw = decodeURIComponent(raw);
  } catch {}
  const withSpaces = raw.replace(/-/g, " ");
  return withSpaces;
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
  // Fallback to tag name if no label found
  return tagName;
}

async function fetchImagesForTag(tagName) {
  // tagName here is already like "Vincent Van Gogh"
  // Cloudinary expects that exact string (with spaces), URL-encoded.
  const url = `https://res.cloudinary.com/${encodeURIComponent(CLOUD_NAME)}/image/list/${encodeURIComponent(tagName)}.json`;

  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) {
    throw new Error(`Tag "${tagName}" not found (HTTP ${res.status})`);
  }

  const data = await res.json();

  // sort newest first
  return (data.resources || []).sort(
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
  document.title = displayName + " – Reframed";

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

    const thumbWidth = isPortrait ? 400 : 600;

    const card = document.createElement("a");
    card.className = "card artwork";
    card.href = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto/${encodeURIComponent(publicId)}`;
    card.rel = "noopener";

    // Handle download via blob to work around CORS restrictions
    card.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const response = await fetch(card.href);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const downloadLink = document.createElement('a');
        downloadLink.href = blobUrl;
        downloadLink.download = niceName || "artwork";
        downloadLink.style.display = 'none';
        document.body.appendChild(downloadLink);

        // Use setTimeout to ensure the click happens after the element is fully added to DOM
        setTimeout(() => {
          downloadLink.click();

          // Track download for tip reminder
          trackDownload();

          // Clean up after a longer delay to ensure mobile browsers have time to process
          setTimeout(() => {
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(blobUrl);
          }, 1000);
        }, 0);
      } catch (error) {
        console.error('Download failed:', error);
        showToast('Download failed, opening in new tab');
        // Fallback to opening in new tab if download fails
        window.open(card.href, '_blank');
      }
    });

    const imgEl = document.createElement("img");
    imgEl.loading = "lazy";
    imgEl.src = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto,w_${thumbWidth}/${encodeURIComponent(publicId)}`;
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
    const images = await fetchImagesForTag(tagName);

    // Special layout rule
    if (tagName === "Vertical artworks") {
      tagViewEl.classList.add("vertical");
    } else {
      tagViewEl.classList.remove("vertical");
    }

    // Only landscapes unless it's "Vertical artworks"
    const filtered =
      tagName === "Vertical artworks"
        ? images
        : images.filter(img => {
            const w = img.width;
            const h = img.height;
            return (typeof w === "number" && typeof h === "number")
              ? (w >= h)
              : true;
          });

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
