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
    card.download = niceName || "artwork";
    card.rel = "noopener";

    // Detect if mobile/touch device
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (isMobile) {
      // Mobile: Two-tap behavior (first tap shows title/hover, second tap downloads)
      let tapped = false;
      card.addEventListener('click', (e) => {
        if (!tapped) {
          // First tap: show hover state
          e.preventDefault();
          card.classList.add('mobile-active');
          tapped = true;

          // Reset after 2 seconds if they don't tap again
          setTimeout(() => {
            card.classList.remove('mobile-active');
            tapped = false;
          }, 2000);
        } else {
          // Second tap: show downloading state and track it
          card.classList.remove('mobile-active');
          card.classList.add('downloading');
          trackDownload();

          // Remove downloading state after download starts
          setTimeout(() => {
            card.classList.remove('downloading');
          }, 1500);
        }
      });
    } else {
      // Desktop: Use blob download to work around CORS
      card.addEventListener('click', async (e) => {
        e.preventDefault();

        // Show downloading state
        card.classList.add('downloading');

        try {
          const response = await fetch(card.href);
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);

          const downloadLink = document.createElement('a');
          downloadLink.href = blobUrl;
          downloadLink.download = niceName || "artwork";
          downloadLink.style.display = 'none';
          document.body.appendChild(downloadLink);
          downloadLink.click();

          // Track download for tip reminder
          trackDownload();

          // Remove downloading state and clean up after a delay
          setTimeout(() => {
            card.classList.remove('downloading');
            if (downloadLink.parentNode) {
              document.body.removeChild(downloadLink);
            }
            URL.revokeObjectURL(blobUrl);
          }, 1000);
        } catch (error) {
          console.error('Download failed:', error);
          card.classList.remove('downloading');
          showToast('Download failed, opening in new tab');
          window.open(card.href, '_blank');
        }
      });
    }

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
