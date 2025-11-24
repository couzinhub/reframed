// Artwork Detail Page
// Displays detailed information about a single artwork

function getSlugFromHash() {
  // Get the raw hash without #
  let raw = window.location.hash.replace(/^#/, "").trim();

  // Convert underscores back to spaces
  return raw.replace(/_/g, ' ');
}

// Local copy of humanizePublicId in case it's not loaded yet
function localHumanizePublicId(publicId) {
  let base = publicId.split("/").pop();
  base = base.replace(/\.[^.]+$/, "");
  return base
    .replace(/_/g, " ")
    .replace(/\s*[-_]\s*reframed[\s_-]*[a-z0-9]*/gi, "")
    .replace(/\s*[-_]\s*portrait\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function fetchArtworkDetailsByName(searchName) {
  try {
    const authHeader = 'Basic ' + btoa(ART_CACHE_TK + ':');

    // Fetch all files and search for the specific one
    // This is the most reliable approach with ImageKit API
    const apiUrl = 'https://api.imagekit.io/v1/files?limit=1000';

    const response = await fetch(apiUrl, {
      headers: { 'Authorization': authHeader }
    });

    if (!response.ok) {
      console.error('Failed to fetch from ImageKit API:', response.status);
      return null;
    }

    const files = await response.json();

    // Use either global or local humanize function
    const humanizeFn = typeof humanizePublicId === 'function' ? humanizePublicId : localHumanizePublicId;

    console.log('Searching for:', searchName);

    // Search through all files by matching humanized name
    const artwork = files.find(f => {
      const filePath = f.filePath.startsWith('/') ? f.filePath.substring(1) : f.filePath;
      const humanizedName = humanizeFn(filePath);
      const matches = humanizedName.toLowerCase() === searchName.toLowerCase();

      if (matches) {
        console.log('Found match:', filePath, '→', humanizedName);
      }

      return matches;
    });

    if (!artwork) {
      console.log('No match found. Sample names:');
      files.slice(0, 5).forEach(f => {
        const filePath = f.filePath.startsWith('/') ? f.filePath.substring(1) : f.filePath;
        console.log(humanizeFn(filePath));
      });
    }

    if (artwork) {
      // Return the artwork with its filePath as publicId
      return {
        ...artwork,
        publicId: artwork.filePath.startsWith('/') ? artwork.filePath.substring(1) : artwork.filePath
      };
    }

    return null;
  } catch (error) {
    console.error('Error fetching artwork details:', error);
    return null;
  }
}

function formatFileSize(bytes) {
  if (!bytes) return 'Unknown';

  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(2)} MB`;
  }

  const kb = bytes / 1024;
  return `${kb.toFixed(2)} KB`;
}

function formatDimensions(width, height) {
  if (!width || !height) return 'Unknown';
  return `${width} × ${height} px`;
}

function getOrientation(width, height) {
  if (!width || !height) return 'Unknown';
  if (height > width) return 'Portrait';
  if (width > height) return 'Landscape';
  return 'Square';
}

// Get description from ImageKit custom field
function getDescriptionFromCustomField(artwork) {
  // Check if customMetadata exists and has a description field
  if (artwork.customMetadata && artwork.customMetadata.description) {
    return artwork.customMetadata.description;
  }
  return null;
}

function renderArtworkDetail(artwork, publicId) {
  const container = document.getElementById('artworkDetailView');
  const humanizeFn = typeof humanizePublicId === 'function' ? humanizePublicId : localHumanizePublicId;
  const niceName = humanizeFn(publicId);

  // Update page title and meta tags
  const pageTitle = `${niceName} - Reframed`;
  document.title = pageTitle;
  document.getElementById('pageTitle').textContent = pageTitle;

  const pageUrl = `https://reframed.gallery/artwork/#${niceName.replace(/\s/g, '_')}`;
  document.getElementById('pageCanonical').setAttribute('href', pageUrl);
  document.getElementById('ogUrl').setAttribute('content', pageUrl);
  document.getElementById('twitterUrl').setAttribute('content', pageUrl);
  document.getElementById('ogTitle').setAttribute('content', pageTitle);
  document.getElementById('twitterTitle').setAttribute('content', pageTitle);

  // Update OG image to the actual artwork
  const imageUrl = getImageUrl(publicId);
  const thumbnailUrl = getThumbnailUrl(publicId, 1400);
  document.getElementById('ogImage').setAttribute('content', thumbnailUrl);

  const description = `View and download "${niceName}" for your Samsung Frame TV.`;
  document.getElementById('pageDescription').setAttribute('content', description);
  document.getElementById('ogDescription').setAttribute('content', description);
  document.getElementById('twitterDescription').setAttribute('content', description);

  // Extract artist name if present
  const artistName = extractArtistFromTitle(niceName);

  // Build tags list (filter out collection tags and show clickable tag pills)
  let tagsHtml = '<div class="tags-list">';
  if (artwork.tags && artwork.tags.length > 0) {
    const filteredTags = artwork.tags.filter(tag =>
      !tag.toLowerCase().startsWith('collection - ') &&
      !tag.toLowerCase().startsWith('thumbnail')
    );

    for (const tag of filteredTags) {
      const prettyTag = tag.trim()
        .replace(/-/g, "%2D")
        .replace(/\s+/g, "-");
      tagsHtml += `<a href="/tag/#${prettyTag}" class="tag-pill">${tag}</a>`;
    }
  }
  if (tagsHtml === '<div class="tags-list">') {
    tagsHtml += '<span class="info-value">No tags</span>';
  }
  tagsHtml += '</div>';

  // Check if artwork is already in downloads
  const isInDownloads = typeof window.isInDownloads === 'function' && window.isInDownloads(publicId);
  const orientation = getOrientation(artwork.width, artwork.height);

  container.innerHTML = `
    <div class="artwork-image-container">
      <img src="${thumbnailUrl}" alt="${niceName}" loading="eager">
    </div>

    <div class="artwork-detail-info">

      <div class="artwork-meta">
        ${artwork.size ? `<div class="file-size-info">${formatFileSize(artwork.size)}</div>` : ''}
          <button id="toggleDownloadBtn" class="btn-primary">
            ${isInDownloads ? 'Remove from Downloads' : 'Add to Downloads'}
          </button>
      </div>

      <div class="artwork-detail-header"><h1 class="artwork-detail-title">${niceName}</h1></div>

      <div id="descriptionSection" class="description-content" style="display: none;">
        <h2 id="descriptionTitle"></h2>
        <div id="descriptionContent"></div>
      </div>
  </div>
  `;

  // Display description from ImageKit custom field
  const artworkDescription = getDescriptionFromCustomField(artwork);
  if (artworkDescription) {
    const descSection = document.getElementById('descriptionSection');
    const descTitle = document.getElementById('descriptionTitle');
    const descContent = document.getElementById('descriptionContent');

    if (descSection && descTitle && descContent) {
      descSection.style.display = 'block';
      descTitle.textContent = '';

      // Split into paragraphs for better readability
      const paragraphs = artworkDescription.split('\n').filter(p => p.trim().length > 0);
      const formattedContent = paragraphs.map(p => `<p>${p}</p>`).join('');

      descContent.innerHTML = formattedContent;
    }
  }

  // Add event listener for toggle download button
  const toggleBtn = document.getElementById('toggleDownloadBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (typeof window.isInDownloads === 'function' && typeof window.addToDownloads === 'function') {
        if (window.isInDownloads(publicId)) {
          window.removeFromDownloads(publicId);
          toggleBtn.textContent = 'Add to Downloads';
          toggleBtn.classList.remove('btn-primary');
          toggleBtn.classList.add('btn-secondary');
        } else {
          window.addToDownloads(publicId, niceName, imageUrl, orientation.toLowerCase());
          toggleBtn.textContent = 'Remove from Downloads';
          toggleBtn.classList.remove('btn-secondary');
          toggleBtn.classList.add('btn-primary');
        }
      }
    });
  }
}

function showError(message) {
  const container = document.getElementById('artworkDetailView');
  container.innerHTML = `
    <div class="error-state">
      <h2>Artwork Not Found</h2>
      <p>${message}</p>
      <br>
      <a href="/" class="btn-primary" style="display: inline-block; max-width: 200px; margin: 0 auto;">
        Back to Home
      </a>
    </div>
  `;
}

async function loadArtworkDetail() {
  const searchName = getSlugFromHash();

  if (!searchName) {
    showError('No artwork specified in URL.');
    return;
  }

  try {
    const artwork = await fetchArtworkDetailsByName(searchName);

    if (!artwork) {
      showError('Could not load artwork details. Please try again later.');
      return;
    }

    renderArtworkDetail(artwork, artwork.publicId);
  } catch (error) {
    console.error('Error loading artwork:', error);
    showError('An error occurred while loading the artwork.');
  }
}

// Load on page load
loadArtworkDetail();

// Reload if hash changes
window.addEventListener('hashchange', loadArtworkDetail);
