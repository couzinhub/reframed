fetch('images.json')
  .then(response => response.json())
  .then(imageGroups => {
    const container = document.getElementById('image-gallery');

    Object.entries(imageGroups).forEach(([artist, items]) => {
      const section = document.createElement('section');

      const h2 = document.createElement('h2');
      h2.textContent = artist;
      section.appendChild(h2);

      const gallery = document.createElement('div');
      gallery.className = 'gallery';

      items.forEach(({ filename, driveUrl }) => {
        const painting = document.createElement('div');
        painting.className = 'painting';

        const link = document.createElement('a');
        link.href = driveUrl;
        link.download = filename;

        const img = document.createElement('img');
        img.src = 'img/small/' + filename;
        img.loading = 'lazy';

        const overlay = document.createElement('div');
        overlay.className = 'info-overlay';

        const h3 = document.createElement('h3');
        h3.textContent = filename.replace(/ - reframed\.jpg$/, '');

        overlay.appendChild(h3);

        link.appendChild(img);
        painting.appendChild(link);
        painting.appendChild(overlay);
        gallery.appendChild(painting);
      });

      section.appendChild(gallery);
      container.appendChild(section);
    });
  })
  .catch(error => {
    console.error('Error loading image data:', error);
  });
