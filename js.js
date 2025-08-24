/* ==============
   js.js — site
   ============== */

/** Paste your Apps Script Web App URL here */
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbz5u126TwWeybbTopg3k2dbduSnHyMoZUdLXQFkz9k-x40ZDgh0ZLF9QYpSHhZHskY4/exec';

/** Orientation state */
let currentOrientation = 'landscape'; // default

function getOrientation(filename) {
  return String(filename).toLowerCase().includes(' - portrait - ') ? 'portrait' : 'landscape';
}

function toggleActive(which) {
  const landBtn = document.getElementById('landscape-btn');
  const portBtn = document.getElementById('portrait-btn');
  if (landBtn) landBtn.classList.toggle('active', which === 'landscape');
  if (portBtn) portBtn.classList.toggle('active', which === 'portrait');

  const containerElm = document.querySelector('.container');
  if (containerElm) containerElm.classList.toggle('portrait-mode', which === 'portrait');
}

function showLoading(show, message = 'Loading paintings…') {
  const loader = document.getElementById('loading');
  const tabs = document.getElementById('orientation-tabs');
  if (loader) {
    loader.textContent = message;
    loader.classList.toggle('hidden', !show);
  }
  if (tabs) {
    tabs.classList.toggle('hidden', show);
  }
}

function normalizePayload(payload) {
  const groups = payload?.groups || payload?.data || payload || {};
  const lastUpdated =
    payload?._lastUpdated ||
    payload?.lastUpdated ||
    groups?._lastUpdated ||
    groups?.lastUpdated ||
    null;

  delete groups._lastUpdated;
  delete groups.lastUpdated;

  return { groups, lastUpdated };
}

function renderGallery(imageGroups) {
  const container = document.getElementById('image-gallery');
  if (!container) return;

  container.innerHTML = '';

  Object.entries(imageGroups).forEach(([artist, items]) => {
    if (!Array.isArray(items)) return;

    const filtered = items.filter(({ filename }) => getOrientation(filename) === currentOrientation);
    if (!filtered.length) return;

    const section = document.createElement('section');

    const h2 = document.createElement('h2');
    h2.textContent = artist;
    section.appendChild(h2);

    const gallery = document.createElement('div');
    gallery.className = 'gallery';

    filtered.forEach(({ filename, driveUrl, thumbUrl }) => {
      const painting = document.createElement('div');
      painting.className = 'painting';

      const link = document.createElement('a');
      link.href = driveUrl;
      link.download = filename;

      link.addEventListener('click', () => {
        if (window.gtag) {
          gtag('event', 'download', {
            event_category: 'Painting',
            event_label: filename
          });
        }
      });

      const img = document.createElement('img');
      img.src = thumbUrl;
      img.alt = String(filename)
        .replace(/ - portrait - /i, ' - ')
        .replace(/ - (reframed|small)\.(jpe?g|png|webp)$/i, '');
      img.loading = 'lazy';

      const overlay = document.createElement('div');
      overlay.className = 'info-overlay';

      const h3 = document.createElement('h3');
      h3.textContent = img.alt;

      overlay.appendChild(h3);
      link.appendChild(img);
      painting.appendChild(link);
      painting.appendChild(overlay);
      gallery.appendChild(painting);
    });

    section.appendChild(gallery);
    container.appendChild(section);
  });
}

function formatDate(isoString) {
  const d = new Date(isoString);
  if (isNaN(d)) return null;
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date}`;
}

/** Boot */
document.addEventListener('DOMContentLoaded', () => {
  showLoading(true);

  const url = `${WEB_APP_URL}?t=${Date.now()}`;

  fetch(url)
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(raw => {
      const { groups, lastUpdated } = normalizePayload(raw);

      // Render galleries
      renderGallery(groups);

      // === Count total paintings ===
      let totalPaintings = 0;
      Object.values(groups).forEach(items => {
        if (Array.isArray(items)) totalPaintings += items.length;
      });

      // Footer text
      const footerText = document.getElementById('last-updated');
      if (footerText) {
        const human = lastUpdated ? formatDate(lastUpdated) : '';
        footerText.textContent = `Paintings: ${totalPaintings}` + (human ? ` — Last updated: ${human}` : '');
      }

      showLoading(false);

      // Tabs
      document.getElementById('landscape-btn')?.addEventListener('click', () => {
        currentOrientation = 'landscape';
        toggleActive('landscape');
        renderGallery(groups);
      });
      document.getElementById('portrait-btn')?.addEventListener('click', () => {
        currentOrientation = 'portrait';
        toggleActive('portrait');
        renderGallery(groups);
      });

      toggleActive(currentOrientation);
    })
    .catch(err => {
      console.error('Error loading image data:', err);
      showLoading(true, 'Sorry, failed to load paintings. Please try again.');
    });
});
