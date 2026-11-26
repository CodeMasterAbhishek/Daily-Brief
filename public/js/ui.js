/**
 * UI module for rendering the DOM elements.
 */

const FALLBACK_IMAGE = 'assets/images/fallback.svg';

const NAMED_ENTITIES = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    rsquo: '’',
    lsquo: '‘',
    rdquo: '”',
    ldquo: '“',
    ndash: '–',
    mdash: '—',
    hellip: '…',
    middot: '·',
    bull: '•',
    copy: '©',
    reg: '®',
    trade: '™',
    euro: '€',
    pound: '£',
    yen: '¥',
    cent: '¢',
    deg: '°',
    times: '×',
    divide: '÷',
    plusmn: '±',
    frac12: '½',
    frac14: '¼',
    frac34: '¾'
};

function decodeHtmlEntities(value) {
    return String(value ?? '').replace(/&(#\d+|#x[\da-fA-F]+|[a-zA-Z]+);/g, (full, entity) => {
        if (entity[0] === '#') {
            const isHex = entity[1] === 'x' || entity[1] === 'X';
            const code = parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10);
            if (Number.isInteger(code) && code >= 1 && code <= 0x10FFFF && !(code >= 0xD800 && code <= 0xDFFF)) {
                return String.fromCodePoint(code);
            }
            return full;
        }
        const replacement = NAMED_ENTITIES[entity.toLowerCase()];
        return replacement !== undefined ? replacement : full;
    });
}

export function cleanArticleMeta(article) {
    if (!article) return article;
    let source = decodeHtmlEntities(String(article.source || '')).trim();
    let title = decodeHtmlEntities(String(article.title || '')).trim();
    const description = decodeHtmlEntities(String(article.description || '')).trim();

    // Only strip trailing ' - Publisher' / ' – Publisher' / ' — Publisher' / ' | Publisher' / ' · Publisher'
    // when source is missing, Google News, or matches the trailing publisher suffix.
    const match = title.match(/^(.*?)\s+[\-–—|·]\s+([^\-–—|·]+)$/);
    if (match && match[1].length >= 10 && match[2].trim().length >= 2) {
        const extractedSource = match[2].trim();
        const isGoogleNews = /google\s*news/i.test(source);
        const matchesSource = Boolean(source && extractedSource.toLowerCase() === source.toLowerCase());
        if (!source || isGoogleNews || matchesSource) {
            if (!source || isGoogleNews) {
                source = extractedSource;
            }
            title = match[1].trim();
            // Clean double suffix when identical to the matched publisher
            const secondMatch = title.match(/^(.*?)\s+[\-–—|·]\s+([^\-–—|·]+)$/);
            if (secondMatch && secondMatch[2].trim().toLowerCase() === extractedSource.toLowerCase()) {
                title = secondMatch[1].trim();
            }
        }
    }

    if (/google\s*news/i.test(source)) {
        source = source.replace(/google\s*news\s*[A-Z]{2}\s*/i, '').trim();
        source = source ? source.charAt(0).toUpperCase() + source.slice(1) : 'News';
    }

    return { ...article, title, source, description };
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeHttpUrl(value) {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return '';
    try {
        const url = new URL(trimmed);
        if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch {
        // Ignore invalid, relative, or non-http URLs.
    }
    return '';
}

function safeImageUrl(value) {
    const url = safeHttpUrl(value);
    if (!url) return FALLBACK_IMAGE;
    if (url.startsWith('http://')) {
        return `https://${url.slice(7)}`;
    }
    return url;
}

function readArticleSet() {
    try {
        const parsed = JSON.parse(localStorage.getItem('readArticles') || '[]');
        return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
        return new Set();
    }
}

function markAsRead(id) {
    if (!id) return;
    try {
        const parsed = JSON.parse(localStorage.getItem('readArticles') || '[]');
        const readArticles = Array.isArray(parsed) ? parsed : [];
        if (!readArticles.includes(id)) {
            readArticles.push(id);
            while (readArticles.length > 500) readArticles.shift();
            localStorage.setItem('readArticles', JSON.stringify(readArticles));
        }
    } catch {}

    const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(String(id))
        : String(id).replace(/"/g, '\\"');
    document.querySelectorAll(`[data-id="${escapedId}"]`).forEach(el => {
        el.classList.add('read-article');
    });
}

let uiListenersInitialized = false;

export function initializeUiListeners() {
    if (uiListenersInitialized || typeof document === 'undefined') return;
    uiListenersInitialized = true;

    const handleArticleLinkActivation = (event) => {
        if (event.type === 'auxclick' && event.button !== 1) return;
        const link = event.target?.closest?.('a.hero-img-wrap, a.card-img-wrap, .card-title a');
        if (!link) return;
        const articleEl = link.closest('[data-id]');
        if (articleEl?.dataset.id) {
            markAsRead(articleEl.dataset.id);
        }
        if (link.getAttribute('href') === '#') {
            event.preventDefault();
        }
    };

    document.addEventListener('click', handleArticleLinkActivation);
    document.addEventListener('auxclick', handleArticleLinkActivation);

    // Capture-phase listener because img error events do not bubble
    document.addEventListener('error', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLImageElement)) return;
        if (!target.classList.contains('hero-img') && !target.classList.contains('card-img')) return;
        if (target.dataset.fallbackApplied === '1') return;
        target.dataset.fallbackApplied = '1';
        target.src = FALLBACK_IMAGE;
    }, true);
}

// Format date nicely (e.g., "Just now", "1 min ago", "2 hours ago", or "Nov 25")
function formatTime(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.round(diffMs / 60000);

    if (diffMins <= 0) return 'Just now';
    if (diffMins === 1) return '1 min ago';
    if (diffMins < 60) return `${diffMins} mins ago`;

    const diffHrs = Math.round(diffMins / 60);
    if (diffHrs === 1) return '1 hour ago';
    if (diffHrs < 24) return `${diffHrs} hours ago`;

    const options = { month: 'short', day: 'numeric' };
    if (date.getFullYear() !== now.getFullYear()) {
        options.year = 'numeric';
    }
    return date.toLocaleDateString('en-US', options);
}

// Generate HTML for the Featured Hero Slider
function createHeroHTML(articles, readSet = readArticleSet()) {
    if (!articles || articles.length === 0) return '';

    let slidesHTML = '';
    let dotsHTML = '';

    articles.forEach((article, index) => {
        const imageUrl = escapeHtml(safeImageUrl(article.image));
        const resolvedUrl = safeHttpUrl(article.url);
        const articleUrl = escapeHtml(resolvedUrl || '#');
        const linkAttrs = resolvedUrl
            ? 'target="_blank" rel="noopener noreferrer"'
            : '';
        const articleId = escapeHtml(article.id);
        const category = escapeHtml((article.category || '').toLowerCase());
        const isActive = index === 0;
        const activeClass = isActive ? 'active' : '';
        const readClass = readSet.has(article.id) ? 'read-article' : '';
        const tabIndexAttr = isActive ? '' : ' tabindex="-1"';

        slidesHTML += `
            <article class="hero-slide ${activeClass} ${readClass}" data-index="${index}" data-category="${category}" data-id="${articleId}" aria-hidden="${isActive ? 'false' : 'true'}">
                <a href="${articleUrl}" ${linkAttrs} class="hero-img-wrap"${tabIndexAttr}>
                    <img src="${imageUrl}" alt="${escapeHtml(article.title)}" class="hero-img">
                    <div class="hero-overlay"></div>
                    <div class="hero-content">
                        <div class="hero-meta">
                            <span class="hero-category">${escapeHtml(article.category)}</span>
                            <span class="hero-source">${escapeHtml(article.source)}</span>
                            <span>${escapeHtml(formatTime(article.publishedAt))}</span>
                        </div>
                        <h1 class="hero-title">${escapeHtml(article.title)}</h1>
                        <p class="hero-desc">${escapeHtml(article.description || '')}</p>
                    </div>
                </a>
            </article>
        `;

        dotsHTML += `<button type="button" class="hero-dot ${activeClass}" aria-label="Go to slide ${index + 1}" aria-current="${isActive ? 'true' : 'false'}" data-slide="${index}"></button>`;
    });

    return `
        <div class="hero-slider">
            ${slidesHTML}
            <button type="button" class="hero-nav-btn prev" aria-label="Previous slide">
                <svg viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"></path></svg>
            </button>
            <button type="button" class="hero-nav-btn next" aria-label="Next slide">
                <svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"></path></svg>
            </button>
            <div class="hero-nav">
                ${dotsHTML}
            </div>
        </div>
    `;
}

// Generate HTML for a single article grid card
function createCardHTML(article, readSet = readArticleSet()) {
    const imageUrl = escapeHtml(safeImageUrl(article.image));
    const resolvedUrl = safeHttpUrl(article.url);
    const articleUrl = escapeHtml(resolvedUrl || '#');
    const linkAttrs = resolvedUrl
        ? 'target="_blank" rel="noopener noreferrer"'
        : '';
    const articleId = escapeHtml(article.id);
    const category = escapeHtml((article.category || '').toLowerCase());
    const readClass = readSet.has(article.id) ? 'read-article' : '';

    return `
        <article class="card ${readClass}" data-category="${category}" data-id="${articleId}">
            <a href="${articleUrl}" ${linkAttrs} class="card-img-wrap">
                <img src="${imageUrl}" alt="${escapeHtml(article.title)}" class="card-img" loading="lazy">
            </a>
            <div class="card-content">
                <div class="card-meta">
                    <span class="card-source">${escapeHtml(article.source)}</span>
                    <span>${escapeHtml(formatTime(article.publishedAt))}</span>
                </div>
                <h2 class="card-title" title="${escapeHtml(article.title)}">
                    <a href="${articleUrl}" ${linkAttrs} style="text-decoration:none; color:inherit;">
                        ${escapeHtml(article.title)}
                    </a>
                </h2>
                <div class="card-actions">
                    <span class="chip-sm">${escapeHtml(article.category)}</span>
                </div>
            </div>
        </article>
    `;
}

let heroSliderInterval = null;

function clearHeroSlider(heroContainer) {
    if (heroSliderInterval) {
        clearInterval(heroSliderInterval);
        heroSliderInterval = null;
    }
    if (heroContainer) {
        heroContainer.innerHTML = '';
        heroContainer.style.display = 'none';
    }
}

// Initialize the Hero Slider logic
function initHeroSlider() {
    const slider = document.querySelector('.hero-slider');
    if (!slider) return;

    const slides = slider.querySelectorAll('.hero-slide');
    const dots = slider.querySelectorAll('.hero-dot');
    const prevBtn = slider.querySelector('.hero-nav-btn.prev');
    const nextBtn = slider.querySelector('.hero-nav-btn.next');

    if (slides.length <= 1) {
        if (prevBtn) prevBtn.hidden = true;
        if (nextBtn) nextBtn.hidden = true;
        const navDots = slider.querySelector('.hero-nav');
        if (navDots) navDots.hidden = true;
        return;
    }

    let currentSlide = 0;
    const totalSlides = slides.length;

    const goToSlide = (index) => {
        slides[currentSlide].classList.remove('active');
        slides[currentSlide].setAttribute('aria-hidden', 'true');
        const oldLink = slides[currentSlide].querySelector('a.hero-img-wrap');
        if (oldLink) oldLink.setAttribute('tabindex', '-1');
        if (dots[currentSlide]) {
            dots[currentSlide].classList.remove('active');
            dots[currentSlide].setAttribute('aria-current', 'false');
        }

        currentSlide = index;

        slides[currentSlide].classList.add('active');
        slides[currentSlide].setAttribute('aria-hidden', 'false');
        const newLink = slides[currentSlide].querySelector('a.hero-img-wrap');
        if (newLink) newLink.removeAttribute('tabindex');
        if (dots[currentSlide]) {
            dots[currentSlide].classList.add('active');
            dots[currentSlide].setAttribute('aria-current', 'true');
        }
    };

    const nextSlide = () => goToSlide((currentSlide + 1) % totalSlides);
    const prevSlide = () => goToSlide((currentSlide - 1 + totalSlides) % totalSlides);

    const prefersReducedMotion = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let manuallyPaused = false;

    const stopAutoPlay = () => {
        if (heroSliderInterval) {
            clearInterval(heroSliderInterval);
            heroSliderInterval = null;
        }
    };

    const startAutoPlay = () => {
        stopAutoPlay();
        if (!prefersReducedMotion && !manuallyPaused) {
            heroSliderInterval = setInterval(nextSlide, 5000);
        }
    };

    const pauseAutoPlay = () => {
        manuallyPaused = true;
        stopAutoPlay();
    };

    startAutoPlay();

    slider.addEventListener('mouseenter', stopAutoPlay);
    slider.addEventListener('mouseleave', startAutoPlay);
    slider.addEventListener('focusin', stopAutoPlay);
    slider.addEventListener('focusout', (event) => {
        if (!slider.contains(event.relatedTarget)) {
            startAutoPlay();
        }
    });

    if (prevBtn) {
        prevBtn.addEventListener('click', (event) => {
            event.preventDefault();
            pauseAutoPlay();
            prevSlide();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', (event) => {
            event.preventDefault();
            pauseAutoPlay();
            nextSlide();
        });
    }

    dots.forEach((dot, index) => {
        dot.addEventListener('click', (event) => {
            event.preventDefault();
            pauseAutoPlay();
            goToSlide(index);
        });
    });

    // Touch / Swipe Support
    let touchStartX = 0;
    let touchEndX = 0;

    slider.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    slider.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        const swipeDistance = touchEndX - touchStartX;
        if (Math.abs(swipeDistance) > 50) {
            pauseAutoPlay();
            if (swipeDistance < 0) nextSlide();
            else prevSlide();
        }
    }, { passive: true });
}

// Render the list of articles to the container
export function renderArticles(articles, containerId = 'news-container', append = false, emptyMessage = 'No news available right now.') {
    initializeUiListeners();

    const gridContainer = document.getElementById(containerId);
    const heroContainer = document.getElementById('hero-container');

    if (!gridContainer || !heroContainer) return;

    if (!articles || articles.length === 0) {
        if (!append) {
            clearHeroSlider(heroContainer);
            gridContainer.innerHTML = `
                <div style="grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; min-height: 60vh; color: var(--text-secondary);">
                    <h2>${escapeHtml(emptyMessage)}</h2>
                </div>
            `;
        }
        return;
    }

    const readSet = readArticleSet();
    const cleanedArticles = articles.map(cleanArticleMeta);
    let gridArticles = cleanedArticles;

    // Only render Hero if we are NOT appending and there are enough stories for the grid
    if (!append) {
        const PREMIUM_PUBLISHERS = [
            'The Hindu', 'Indian Express', 'The Indian Express', 'NDTV', 'Hindustan Times',
            'Livemint', 'Times of India', 'The Times of India', 'Economic Times', 'ESPNcricinfo',
            'New York Times', 'NYT Politics', 'NYT Health', 'TechCrunch', 'The Verge',
            'Wired', 'Ars Technica', 'Variety', 'Hollywood Reporter', 'Billboard',
            'Rolling Stone', 'Polygon', 'NASA', 'STAT', 'NPR Politics', 'BBC News',
            'CBC News', 'ABC News', 'The Guardian', 'Sky News', 'Quanta Magazine',
            'MIT Technology Review', 'The Economist', 'WSJ'
        ];

        let heroCandidates = [];
        if (cleanedArticles.length > 5) {
            const heroPool = cleanedArticles.filter(a => a.tier === 1 || PREMIUM_PUBLISHERS.includes(a.source));
            const hasRealImage = a => Boolean(safeHttpUrl(a.image));
            heroCandidates = [
                ...heroPool.filter(hasRealImage),
                ...heroPool.filter(a => !hasRealImage(a))
            ].slice(0, 5);
            heroCandidates.sort((a, b) => (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0));

            const heroSet = new Set(heroCandidates);
            gridArticles = cleanedArticles.filter(a => !heroSet.has(a));
        }

        if (heroCandidates.length > 0) {
            if (heroSliderInterval) {
                clearInterval(heroSliderInterval);
                heroSliderInterval = null;
            }
            heroContainer.innerHTML = createHeroHTML(heroCandidates, readSet);
            heroContainer.style.display = 'block';
            initHeroSlider();
        } else {
            clearHeroSlider(heroContainer);
        }
    }

    let html = '';
    gridArticles.forEach(article => {
        html += createCardHTML(article, readSet);
    });

    if (append) {
        gridContainer.insertAdjacentHTML('beforeend', html);
    } else {
        gridContainer.innerHTML = html;
    }
}

// Show skeletons while fetching chunks
export function showSkeletons(containerId = 'news-container', count = 10) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const skeletonHTML = '<article class="card temp-skeleton"><div class="card-img-wrap skeleton"></div><div class="card-content"><div class="skeleton skeleton-text short"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text"></div></div></article>';
    container.insertAdjacentHTML('beforeend', skeletonHTML.repeat(count));
}

export function removeSkeletons(containerId = 'news-container') {
    const container = document.getElementById(containerId);
    if (!container) return;
    const skeletons = container.querySelectorAll('.temp-skeleton');
    skeletons.forEach(s => s.remove());
}
