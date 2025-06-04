const container = document.getElementById('image-gallery');

// Populate image gallery
Object.entries(imageGroups).forEach(([artist, filenames]) => {
  const section = document.createElement('section');

  const h2 = document.createElement('h2');
  h2.textContent = artist;
  section.appendChild(h2);

  const gallery = document.createElement('div');
  gallery.className = 'gallery';

  filenames.forEach(filename => {
    const painting = document.createElement('div');
    painting.className = 'painting';

    const link = document.createElement('a');
    link.href = 'img/large/' + filename;
    link.download = filename;

    const match = filename.match(/- (.+?) - reframed\.jpg$/);
    const title = match ? match[1] : 'Untitled';

    const img = document.createElement('img');
    img.src = 'img/small/' + filename;
    img.loading = 'lazy';

    const overlay = document.createElement('div');
    overlay.className = 'info-overlay';

    const h3 = document.createElement('h3');
    h3.textContent = title;

    const infoBtn = document.createElement('button');
    infoBtn.className = 'info-button';
    infoBtn.textContent = 'i';
    infoBtn.title = 'Compare with original';
    infoBtn.setAttribute('data-filename', filename);
    infoBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      openComparison(filename);
    });

    overlay.appendChild(infoBtn);
    overlay.appendChild(h3);
    painting.appendChild(link);  // Add link here
    painting.appendChild(overlay);  // Add overlay outside of the link
    link.appendChild(img);  // Image still inside the link
    gallery.appendChild(painting);
  });

  section.appendChild(gallery);
  container.appendChild(section);
});

// Overlay logic
function openComparison(filename) {
  const overlay = document.querySelector('.comparison-overlay');
  const previewImg = overlay.querySelector('.preview-image');
  const originalImg = overlay.querySelector('.original-image');
  const handle = overlay.querySelector('.comparison-handle');

  const labelLeft = document.createElement('div');
  labelLeft.className = 'comparison-label label-left';
  labelLeft.textContent = 'Reframed';

  const labelRight = document.createElement('div');
  labelRight.className = 'comparison-label label-right';
  labelRight.textContent = 'Original';

  handle.appendChild(labelLeft);
  handle.appendChild(labelRight);

  const previewPath = 'img/preview/' + filename.replace('reframed', 'preview');
  const originalPath = 'img/original/' + filename.replace('reframed', 'original');

  previewImg.src = previewPath;
  originalImg.src = originalPath;

  overlay.classList.add('active');

  let dragging = false;

  const startDrag = e => {
    dragging = true;
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchmove', onDrag, { passive: false });
    document.addEventListener('touchend', endDrag);
  };

  const onDrag = e => {
    if (!dragging) return;
    const slider = overlay.querySelector('.comparison-slider');
    const rect = slider.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let offset = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    let percent = (offset / rect.width) * 100;
    previewImg.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
    handle.style.left = `${percent}%`;
    if (e.touches) e.preventDefault();
  };

  const endDrag = () => {
    dragging = false;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', endDrag);
    document.removeEventListener('touchmove', onDrag);
    document.removeEventListener('touchend', endDrag);
  };

  handle.style.left = '50%';
  previewImg.style.clipPath = 'inset(0 50% 0 0)';
  handle.addEventListener('mousedown', startDrag);
  handle.addEventListener('touchstart', startDrag);
}

// Close overlay when clicking outside of the comparison window
document.querySelector('.comparison-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {  // Only close if the click is on the overlay background (not on the content)
    document.querySelector('.comparison-overlay').classList.remove('active');
  }
});

// Close overlay with Escape key
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    const overlay = document.querySelector('.comparison-overlay');
    if (overlay.classList.contains('active')) {
      overlay.classList.remove('active');
    }
  }
});
