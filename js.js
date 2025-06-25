let currentOrientation = 'landscape'; // default

function getOrientation(filename) {
  return filename.includes(' - portrait - ') ? 'portrait' : 'landscape';
}

function renderGallery(imageGroups) {
  const container = document.getElementById('image-gallery');
  container.innerHTML = ''; // clear previous content

  if (currentOrientation === 'portrait') {
    container.classList.add('portrait-mode');
  } else {
    container.classList.remove('portrait-mode');
  }

  Object.entries(imageGroups).forEach(([artist, items]) => {
    const filteredItems = items.filter(({ filename }) => getOrientation(filename) === currentOrientation);
    if (filteredItems.length === 0) return;

    const section = document.createElement('section');

    const h2 = document.createElement('h2');
    h2.textContent = artist;
    section.appendChild(h2);

    const gallery = document.createElement('div');
    gallery.className = 'gallery';

    filteredItems.forEach(({ filename, driveUrl }) => {
      const painting = document.createElement('div');
      painting.className = 'painting';

      const link = document.createElement('a');
      link.href = driveUrl;
      link.download = filename;

      // ✅ Add GA tracking
      link.addEventListener('click', () => {
        if (window.gtag) {
          gtag('event', 'download', {
            'event_category': 'Painting',
            'event_label': filename
          });
        }
      });

      const img = document.createElement('img');
      img.src = 'img/small/' + filename;
      img.loading = 'lazy';

      const overlay = document.createElement('div');
      overlay.className = 'info-overlay';

      const h3 = document.createElement('h3');
      h3.textContent = filename
        .replace(/ - portrait/, '')               // remove " - portrait"
        .replace(/ - reframed\.jpg$/, '');        // remove " - reframed.jpg"

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

fetch('images.json')
  .then(response => response.json())
  .then(imageGroups => {
    renderGallery(imageGroups);

    document.getElementById('landscape-btn').addEventListener('click', () => {
      currentOrientation = 'landscape';
      renderGallery(imageGroups);
      toggleActive('landscape');
    });

    document.getElementById('portrait-btn').addEventListener('click', () => {
      currentOrientation = 'portrait';
      renderGallery(imageGroups);
      toggleActive('portrait');
    });
  })
  .catch(error => {
    console.error('Error loading image data:', error);
  });

function toggleActive(which) {
  document.getElementById('landscape-btn')?.classList.toggle('active', which === 'landscape');
  document.getElementById('portrait-btn')?.classList.toggle('active', which === 'portrait');
}
