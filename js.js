/* ==============
   js.js — site
   ============== */

/** Paste your Apps Script Web App URL here */
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbz5u126TwWeybbTopg3k2dbduSnHyMoZUdLXQFkz9k-x40ZDgh0ZLF9QYpSHhZHskY4/exec';

/** Orientation state */
let currentOrientation = 'landscape'; // default

/** Determine orientation from filename:
 *  Treat as portrait only if it contains " - portrait - "
 */
function getOrientation(filename) {
  return filename.toLowerCase().includes(' - portrait - ') ? 'portrait' : 'landscape';
}

/** Toggle active class on the two tabs */
function toggleActive(which) {
  const landBtn = document.getElementById('landscape-btn');
  const portBtn = document.getElementById('portrait-btn');
  if (landBtn) landBtn.classList.toggle('active', which === 'landscape');
  if (portBtn) portBtn.classList.toggle('active', which === 'portrait');

  // Optional: toggle a container class if you style portrait differently
  const containerElm = document.querySelector('.container');
  if (containerElm) {
    containerElm.classList.toggle('portrait-mode', which === 'portrait');
  }
}

/** Show while fetching, hide after render (and on error) */
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

/** Render all sections & paintings from JSON */
function renderGallery(imageGroups) {
  const container = document.getElementById('image-gallery');
  if (!container) return;

  container.innerHTML = ''; // clear previous content

  Object.entries(imageGroups).forEach(([artist, items]) => {
    // Filter by orientation
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

      // Link to large download on Drive
      const link = document.createElement('a');
      link.href = driveUrl;
      link.download = filename;

      // Optional GA tracking
      link.addEventListener('click', () => {
        if (window.gtag) {
          gtag('event', 'download', {
            event_category: 'Painting',
            event_label: filename
          });
        }
      });

      // Thumbnail from Drive
      const img = document.createElement('img');
      img.src = thumbUrl;
      img.alt = filename
        .replace(/ - portrait - /i, ' - ')
        .replace(/ - (reframed|small)\.(jpe?g|png|webp)$/i, '');
      img.loading = 'lazy';

      // Hover title
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

/** Boot */
document.addEventListener('DOMContentLoaded', () => {
  // show loader right away
  showLoading(true);

  const url = `${WEB_APP_URL}?t=${Date.now()}`;

  fetch(url)
    .then(r => r.json())
    .then(data => {
      renderGallery(data);
      showLoading(false);

      // set initial active state
      toggleActive(currentOrientation);

      // wire up tabs
      const landBtn = document.getElementById('landscape-btn');
      const portBtn = document.getElementById('portrait-btn');

      if (landBtn) {
        landBtn.addEventListener('click', () => {
          currentOrientation = 'landscape';
          toggleActive('landscape');
          renderGallery(data);
        });
      }

      if (portBtn) {
        portBtn.addEventListener('click', () => {
          currentOrientation = 'portrait';
          toggleActive('portrait');
          renderGallery(data);
        });
      }
    })
    .catch(err => {
      console.error('Error loading image data:', err);
      showLoading(true, 'Sorry, failed to load paintings. Please try again.');
    });
});
