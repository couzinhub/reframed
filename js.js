const container = document.getElementById('image-gallery');

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

    // Extract painting title from filename
    const match = filename.match(/- (.+?) - reframed\.jpg$/);
    const title = match ? match[1] : 'Untitled';
    link.title = title;

    const img = document.createElement('img');
    img.src = 'img/small/' + filename;
    img.loading = 'lazy';

    const overlay = document.createElement('div');
    overlay.className = 'info-overlay';

    const h3 = document.createElement('h3');
    h3.textContent = title;

    overlay.appendChild(h3);
    link.appendChild(img);
    link.appendChild(overlay);
    painting.appendChild(link);
    gallery.appendChild(painting);
  });

  section.appendChild(gallery);
  container.appendChild(section);
});
