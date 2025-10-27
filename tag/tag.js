
function getTagFromHash() {
  const raw = window.location.hash.replace(/^#/, "").trim();
  return decodeURIComponent(raw);
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
  const url = `https://res.cloudinary.com/${encodeURIComponent(CLOUD_NAME)}/image/list/${encodeURIComponent(tagName)}.json`;
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) {
    throw new Error(`Tag "${tagName}" not found (HTTP ${res.status})`);
  }
  const data = await res.json();
  return (data.resources || []).sort(
    (a, b) => (b.created_at || "").localeCompare(a.created_at || "")
  );
}

function renderTagGallery(tagName, images) {
  const tagTitleEl = document.getElementById("tagTitle");
  const tagStatusEl = document.getElementById("tagStatus");
  const tagGridEl = document.getElementById("tagGrid");

  const prettyTagName = tagName.replace(/[-_]+/g, " ").trim();
  tagTitleEl.textContent = prettyTagName;

  // show artwork count under the title
  tagStatusEl.textContent = `${images.length} artwork${images.length === 1 ? "" : "s"}`;

  tagGridEl.innerHTML = "";

  const frag = document.createDocumentFragment();

  for (const img of images) {
    const publicId = img.public_id;
    const niceName = humanizePublicId(publicId);

    const w = img.width;
    const h = img.height;
    const isPortrait = typeof w === "number" && typeof h === "number" && h > w;
    const thumbWidth = isPortrait ? 400 : 600;

    const card = document.createElement("a");
    card.className = "tag-card";
    card.href = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto/${encodeURIComponent(publicId)}`;
    card.target = "_blank";
    card.rel = "noopener";

    const imgEl = document.createElement("img");
    imgEl.loading = "lazy";
    imgEl.src = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto,w_${thumbWidth}/${encodeURIComponent(publicId)}`;
    imgEl.alt = niceName;

    const caption = document.createElement("div");
    caption.className = "tag-caption";
    caption.textContent = niceName;

    card.appendChild(imgEl);
    card.appendChild(caption);
    frag.appendChild(card);
  }

  tagGridEl.appendChild(frag);
}

async function loadAndRenderTagPage() {
  const tagName = getTagFromHash();
  const tagViewEl = document.getElementById("tagView");
  const tagTitleEl = document.getElementById("tagTitle");
  const tagStatusEl = document.getElementById("tagStatus");

  if (!tagName) {
    tagTitleEl.textContent = "No tag selected";
    tagStatusEl.textContent = "";
    return;
  }

  tagStatusEl.textContent = "Loading…";

  try {
    const images = await fetchImagesForTag(tagName);

    // toggle vertical layout class
    if (tagName === "Vertical artworks") {
      tagViewEl.classList.add("vertical");
    } else {
      tagViewEl.classList.remove("vertical");
    }

    // orientation filter (only landscape for normal tags)
    const filtered =
      tagName === "Vertical artworks"
        ? images
        : images.filter(img => {
            const w = img.width;
            const h = img.height;
            return typeof w === "number" && typeof h === "number" ? w >= h : true;
          });

    if (!filtered.length) {
      tagStatusEl.textContent = "No artworks found.";
      document.getElementById("tagGrid").innerHTML = "";
      return;
    }

    renderTagGallery(tagName, filtered);
  } catch (err) {
    console.error(err);
    tagStatusEl.textContent = `Error: ${err.message}`;
  }
}

loadAndRenderTagPage();
window.addEventListener("hashchange", loadAndRenderTagPage);
