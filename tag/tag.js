// assumes config.js is loaded first with:
// CLOUD_NAME

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
  tagStatusEl.textContent = "Loading…";
  document.title = prettyTagName + " – Reframed";

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
