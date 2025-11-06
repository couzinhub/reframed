// assumes config.js is loaded first with:
// CLOUD_NAME

// ---------- MOBILE MENU TOGGLE ----------
const hamburgerMenu = document.querySelector('.hamburger-menu');
const aside = document.querySelector('aside');

if (hamburgerMenu) {
  hamburgerMenu.addEventListener('click', () => {
    hamburgerMenu.classList.toggle('active');
    aside.classList.toggle('active');
    document.body.classList.toggle('menu-open');
  });

  // Close menu when clicking overlay
  document.body.addEventListener('click', (e) => {
    if (document.body.classList.contains('menu-open') &&
        !aside.contains(e.target) &&
        !hamburgerMenu.contains(e.target)) {
      hamburgerMenu.classList.remove('active');
      aside.classList.remove('active');
      document.body.classList.remove('menu-open');
    }
  });

  // Close menu when clicking a link in the sidebar
  aside.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburgerMenu.classList.remove('active');
      aside.classList.remove('active');
      document.body.classList.remove('menu-open');
    });
  });
}

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


function humanizePublicId(publicId) {
  let base = publicId.split("/").pop();
  return base
    .replace(/_/g, " ")
    .replace(/\s*-\s*reframed[\s_-]*[a-z0-9]+$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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

  // tagName is already "Vincent Van Gogh" (spaces), or "Vertical artworks"
  const prettyTagName = tagName.trim();
  tagTitleEl.textContent = prettyTagName;
  document.title = prettyTagName + " – Reframed";

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
    card.target = "_blank";
    card.rel = "noopener";

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

  const prettyTagName = tagName.trim();
  tagTitleEl.textContent = prettyTagName;
  document.title = prettyTagName + " – Reframed";

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
