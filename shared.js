// ============ NAVIGATION MENU COMPONENT ============
// This code is shared across all pages

function initializeNavigation(currentPage) {
  // Determine if we're in a subdirectory - use absolute paths for tag pages
  const isSubdirectory = window.location.pathname.includes('/tag/');
  const imgPath = isSubdirectory ? '/img/reframed.svg' : 'img/reframed.svg';

  // Insert mobile top bar
  const mobileTopBar = `
    <div class="mobile-top-bar">
      <button class="hamburger-menu" aria-label="Toggle menu">
        <span></span>
        <span></span>
        <span></span>
      </button>
      <a href="/">
        <img src="${imgPath}" alt="Reframed Logo" class="mobile-logo">
      </a>
    </div>
  `;

  // Insert sidebar
  const aside = `
    <aside>
      <a href="/">
        <img id="logo" src="${imgPath}" alt="Reframed Logo">
      </a>
      <ul>
        <li class="${currentPage === 'home' ? 'current' : ''}"><a href="/">Home</a></li>
        <li class="${currentPage === 'artists' ? 'current' : ''}"><a href="/artists.html">Artists</a></li>
        <li class="${currentPage === 'collections' ? 'current' : ''}"><a href="/collections.html">Collections</a></li>
        <li class="${currentPage === 'tag' && window.location.hash === '#Vertical-artworks' ? 'current' : ''}"><a href="/tag/#Vertical-artworks">Vertical artworks</a></li>
        <li class="${currentPage === 'faq' ? 'current' : ''}"><a href="/faq.html">FAQ</a></li>
        <li class="${currentPage === 'contact' ? 'current' : ''}"><a href="/contact.html">Contact</a></li>
      </ul>
      <div class="button tip"></div>
      <div class="button own-art">
        <a class="contact" href="/contact.html">Get your own art reframed</a>
      </div>
    </aside>
  `;

  // Insert into page
  document.body.insertAdjacentHTML('afterbegin', mobileTopBar + aside);

  // Add Ko-fi button styled like the original widget
  const tipContainer = document.querySelector('.button.tip');
  if (tipContainer) {
    tipContainer.innerHTML = `
      <a href="https://ko-fi.com/O5O51FWPUL" target="_blank" class="kofi-button" style="
        display: inline-block;
        padding: 8px 16px;
        background-color: #00488c;
        color: #fff;
        text-decoration: none;
        border-radius: 7px;
        font-family: 'Quicksand', Helvetica, sans-serif;
        font-size: 14px;
        font-weight: 700;
        line-height: 36px;
        box-shadow: 1px 1px 0px rgba(0, 0, 0, 0.2);
        text-align: center;
        min-width: 150px;
        transition: opacity 0.2s;
      " onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
        <img src="https://storage.ko-fi.com/cdn/cup-border.png" alt="Ko-fi" style="
          height: 15px;
          width: 22px;
          vertical-align: middle;
          margin-right: 5px;
          margin-bottom: 3px;
          border: none;
        ">
        <span style="vertical-align: middle;">Thank me with a tip</span>
      </a>
    `;
  }

  // Update Vertical artworks menu item if on tag page with hash
  if (currentPage === 'tag') {
    const updateVerticalMenuItem = () => {
      const verticalItem = asideElement.querySelector('a[href="/tag/#Vertical-artworks"]')?.parentElement;
      if (verticalItem) {
        if (window.location.hash === '#Vertical-artworks') {
          verticalItem.classList.add('current');
        } else {
          verticalItem.classList.remove('current');
        }
      }
    };

    // Update immediately and on hash change
    setTimeout(updateVerticalMenuItem, 0);
    window.addEventListener('hashchange', updateVerticalMenuItem);
  }

  // Initialize mobile menu functionality
  const hamburgerMenu = document.querySelector('.hamburger-menu');

  if (hamburgerMenu) {
    hamburgerMenu.addEventListener('click', () => {
      hamburgerMenu.classList.toggle('active');
      asideElement.classList.toggle('active');
      document.body.classList.toggle('menu-open');
    });

    // Close menu when clicking overlay
    document.body.addEventListener('click', (e) => {
      if (document.body.classList.contains('menu-open') &&
          !asideElement.contains(e.target) &&
          !hamburgerMenu.contains(e.target)) {
        hamburgerMenu.classList.remove('active');
        asideElement.classList.remove('active');
        document.body.classList.remove('menu-open');
      }
    });

    // Close menu when clicking a link in the sidebar
    asideElement.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        hamburgerMenu.classList.remove('active');
        asideElement.classList.remove('active');
        document.body.classList.remove('menu-open');
      });
    });
  }
}
