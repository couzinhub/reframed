fetch('images.json')
  .then(res => res.json())
  .then(imageGroups => {
    const container = document.getElementById('image-gallery');

    Object.entries(imageGroups).forEach(([artist, images]) => {
      const section = document.createElement('section');

      const h2 = document.createElement('h2');
      h2.textContent = artist;
      section.appendChild(h2);

      const gallery = document.createElement('div');
      gallery.className = 'gallery';

      images.forEach(({ filename, driveUrl }) => {
        if (!filename || !driveUrl) {
          console.warn('Missing filename or driveUrl for', { filename, driveUrl });
          return;
        }

        const painting = document.createElement('div');
        painting.className = 'painting';

        const img = document.createElement('img');
        img.src = 'img/small/' + filename;
        img.loading = 'lazy';

        const link = document.createElement('a');
        link.href = convertToDriveDownloadUrl(driveUrl);
        link.download = ''; // optional
        link.appendChild(img);

        painting.appendChild(link);
        gallery.appendChild(painting);
      });

      section.appendChild(gallery);
      container.appendChild(section);
    });
  })
  .catch(error => {
    console.error('Error loading image data:', error);
  });

// === Converts a Google Drive sharing link to a direct download link ===
function convertToDriveDownloadUrl(driveUrl) {
  const match = driveUrl?.match(/\/d\/([^/]+)\//);
  if (!match || !match[1]) {
    console.warn('Invalid driveUrl format:', driveUrl);
    return '#';
  }
  return `https://drive.google.com/uc?export=download&id=${match[1]}`;
}
