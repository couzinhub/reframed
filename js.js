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

    const img = document.createElement('img');
    img.src = 'img/small/' + filename;
    img.loading = 'lazy';

    link.appendChild(img);
    painting.appendChild(link);
    gallery.appendChild(painting);
  });

  section.appendChild(gallery);
  container.appendChild(section);
});
