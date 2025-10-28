// assumes config.js is loaded first with:
// CLOUD_NAME, ARTISTS_CSV_URL

// ---------- lightweight in-tab cache ----------
let ARTISTS_CACHE = null; // [{ row, chosenImage }, ...]
let ARTISTS_SCROLL_Y = 0;

let CURRENT_VIEW = "artists"; // or "tag"
let CURRENT_TAG = null;

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
  const res = await fetch(ARTISTS_CSV_URL + "&t=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load artist sheet: HTTP " + res.status);

  const csvText = await res.text();
  const rows = parseCSV(csvText);
  if (!rows.length) return [];

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

  return out;
}

// ---------- CLOUDINARY ----------
async function fetchImagesForTag(tagName) {
  const url = `https://res.cloudinary.com/${encodeURIComponent(CLOUD_NAME)}/image/list/${encodeURIComponent(tagName)}.json`;
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) return { all: [], landscape: [] };

  const data = await res.json();
  const all = (data.resources || []).sort((a, b) =>
    (b.created_at || "").localeCompare(a.created_at || "")
  );

  const landscape = all.filter(img => {
    const w = img.width;
    const h = img.height;
    return typeof w === "number" && typeof h === "number" ? w >= h : true;
  });

  return { all, landscape };
}

// pickFeaturedImage respects Featured public ID (fuzzy) and falls back smartly
function pickFeaturedImage(row, imageSets) {
  const desired = (row.featuredPublicId || "").trim().toLowerCase();
  if (!desired) return imageSets.landscape[0] || imageSets.all[0] || null;

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

// ---------- RENDER ----------
function buildArtistCard(row, imgData) {
  const card = document.createElement("a");
  card.className = "artist-card";
  card.href = `/tag/#${encodeURIComponent(row.tag)}`; // pretty URL for the address bar
  card.setAttribute("aria-label", row.label);
  card.setAttribute("data-tag", row.tag);

  card.addEventListener("click", async (ev) => {
    ev.preventDefault();

    // save scroll so we can restore later
    ARTISTS_SCROLL_Y = window.scrollY;

    // push the new URL to history WITHOUT leaving the page
    history.pushState(
      { view: "tag", tag: row.tag },
      "",
      `/tag/#${encodeURIComponent(row.tag)}`
    );

    // render that tag view
    await showTagView(row.tag);
  });

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
  labelEl.textContent = row.label;
  card.appendChild(labelEl);

  return card;
}

function renderArtistsGrid(artistsList) {
  const grid = document.getElementById("artistsGrid");
  const status = document.getElementById("artistsStatus");

  grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const artist of artistsList) {
    frag.appendChild(buildArtistCard(artist.row, artist.chosenImage));
  }
  grid.appendChild(frag);

  status.textContent = `${artistsList.length} artist${artistsList.length === 1 ? "" : "s"}`;
}

// ---------- HELPER: batch processor (20 at a time) ----------
async function processInBatches(items, batchSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

async function fetchImagesForSingleTag_unfiltered(tagName) {
  const url = `https://res.cloudinary.com/${encodeURIComponent(CLOUD_NAME)}/image/list/${encodeURIComponent(tagName)}.json`;
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) {
    return [];
  }
  const data = await res.json();
  return (data.resources || []).sort(
    (a, b) => (b.created_at || "").localeCompare(a.created_at || "")
  );
}

function renderTagIntoPage(tagName, images) {
  const tagPage = document.getElementById("tagPage");
  const artistsPage = document.getElementById("artistsPage");

  const tagTitleEl = document.getElementById("tagTitle");
  const tagStatusEl = document.getElementById("tagStatus");
  const tagGridEl = document.getElementById("tagGrid");

  // Special rules from before:
  // - if tag === "Vertical artworks": show all and mark vertical class
  // - else: filter to landscape only
  const isVertical = tagName === "Vertical artworks";

  const filtered = isVertical
    ? images
    : images.filter(img => {
        const w = img.width;
        const h = img.height;
        return (typeof w === "number" && typeof h === "number") ? (w >= h) : true;
      });

  const prettyTagName = tagName.replace(/[-_]+/g, " ").trim();
  tagTitleEl.textContent = prettyTagName;
  tagStatusEl.textContent = `${filtered.length} artwork${filtered.length === 1 ? "" : "s"}`;

  tagGridEl.innerHTML = "";

  const frag = document.createDocumentFragment();

  for (const img of filtered) {
    const publicId = img.public_id;
    const niceName = humanizePublicId(publicId);

    // portrait vs landscape sizing logic you already had:
    const w = img.width;
    const h = img.height;
    const portrait = typeof w === "number" && typeof h === "number" && h > w;
    const thumbWidth = portrait ? 400 : 600;

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

  // toggle which section is visible
  artistsPage.style.display = "none";
  tagPage.style.display = "";

  // apply / remove vertical class on container like before
  const appView = document.getElementById("appView");
  if (isVertical) {
    appView.classList.add("vertical");
  } else {
    appView.classList.remove("vertical");
  }

  CURRENT_VIEW = "tag";
  CURRENT_TAG = tagName;
}

async function showTagView(tagName) {
  const imgs = await fetchImagesForSingleTag_unfiltered(tagName);
  renderTagIntoPage(tagName, imgs);
}


// ---------- MAIN (with in-tab cache) ----------
(async function initArtistsPage() {
  const status = document.getElementById("artistsStatus");

  // If we already loaded once (same tab), just render and wire up history.
  if (ARTISTS_CACHE && Array.isArray(ARTISTS_CACHE)) {
    renderArtistsGrid(ARTISTS_CACHE);

    if (!history.state) {
      history.replaceState({ view: "artists" }, "", "/artists.html");
    }

    return;
  }

  status.textContent = "Loading…";

  try {
    const rows = await loadArtistRows();

    // batch 20 at a time
    const artists = await processInBatches(rows, 20, async (row) => {
      const imageSets = await fetchImagesForTag(row.tag);
      const chosenImage = pickFeaturedImage(row, imageSets);
      return { row, chosenImage };
    });

    ARTISTS_CACHE = artists; // save for this tab
    renderArtistsGrid(artists);
    status.textContent = `${artists.length} artist${artists.length === 1 ? "" : "s"}`;

    // register our "artists" state in history so Back works
    if (!history.state) {
      history.replaceState({ view: "artists" }, "", "/artists.html");
    }

  } catch (err) {
    console.error(err);
    status.textContent = "Error loading artists: " + err.message;
  }
})();

window.addEventListener("popstate", (event) => {
  // If the state says we're on a tag view, show that tag again.
  // If there's no state or it's something else, show the artists page.

  const state = event.state;

  if (state && state.view === "tag" && state.tag) {
    // user navigated "forward" into a tag via browser's back/forward buttons
    showTagView(state.tag);
    return;
  }

  // Otherwise, go back to artists list
  const tagPage = document.getElementById("tagPage");
  const artistsPage = document.getElementById("artistsPage");

  tagPage.style.display = "none";
  artistsPage.style.display = "";

  CURRENT_VIEW = "artists";
  CURRENT_TAG = null;

  // restore scroll
  window.scrollTo(0, ARTISTS_SCROLL_Y);
});
