/**
 * UI module for rendering the DOM elements.
 */

window.markAsRead = function(id) {
    try {
        const readArticles = JSON.parse(localStorage.getItem('readArticles') || '[]');
        if (!readArticles.includes(id)) {
            readArticles.push(id);
            if (readArticles.length > 500) readArticles.shift(); // keep limit
            localStorage.setItem('readArticles', JSON.stringify(readArticles));
        }
        
        const elements = document.querySelectorAll(`[data-id="${id}"]`);
        elements.forEach(el => el.classList.add('read-article'));
    } catch(e) {}
};

// Format date nicely (e.g., "2 hours ago" or "July 18")
function formatTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.round(diffMs / 60000);
    const diffHrs = Math.round(diffMins / 60);

    if (diffMins < 60) return `${diffMins} mins ago`;
    if (diffHrs < 24) return `${diffHrs} hours ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Generate HTML for the Featured Hero Slider
function createHeroHTML(articles) {
    if (!articles || articles.length === 0) return '';
    
    let slidesHTML = '';
    let dotsHTML = '';
    
    articles.forEach((article, index) => {
        const imageUrl = article.image || 'assets/images/fallback.jpg';
        const activeClass = index === 0 ? 'active' : '';
        
        let readClass = '';
        try {
            const readArticles = JSON.parse(localStorage.getItem('readArticles') || '[]');
            if (readArticles.includes(article.id)) {
                readClass = 'read-article';
            }
        } catch(e) {}
        
        slidesHTML += `
            <article class="hero-slide ${activeClass} ${readClass}" data-index="${index}" data-category="${article.category.toLowerCase()}" data-id="${article.id}">
                <a href="${article.url}" target="_blank" rel="noopener noreferrer" class="hero-img-wrap" onclick="markAsRead('${article.id}')">
                    <img src="${imageUrl}" alt="${article.title}" class="hero-img" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100%25\\' height=\\'100%25\\'%3E%3Crect width=\\'100%25\\' height=\\'100%25\\' fill=\\'%2318181b\\'/%3E%3C/svg%3E'">
                    <div class="hero-overlay"></div>
                    <div class="hero-content">
                        <div class="hero-meta">
                            <span class="hero-category">${article.category}</span>
                            <span class="hero-source">${article.source}</span>
                            <span>${formatTime(article.publishedAt)}</span>
                        </div>
                        <h1 class="hero-title">${article.title}</h1>
                        <p class="hero-desc">${article.description || ''}</p>
                    </div>
                </a>
            </article>
        `;
        
        dotsHTML += `<button class="hero-dot ${activeClass}" aria-label="Go to slide ${index + 1}" data-slide="${index}"></button>`;
    });

    return `
        <div class="hero-slider">
            ${slidesHTML}
            <button class="hero-nav-btn prev" aria-label="Previous slide">
                <svg viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"></path></svg>
            </button>
            <button class="hero-nav-btn next" aria-label="Next slide">
                <svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"></path></svg>
            </button>
            <div class="hero-nav">
                ${dotsHTML}
            </div>
        </div>
    `;
}

// Generate HTML for a single article grid card
function createCardHTML(article) {
    const imageUrl = article.image || 'assets/images/fallback.jpg';
    
    let readClass = '';
    try {
        const readArticles = JSON.parse(localStorage.getItem('readArticles') || '[]');
        if (readArticles.includes(article.id)) {
            readClass = 'read-article';
        }
    } catch(e) {}
    
    return `
        <article class="card ${readClass}" data-category="${article.category.toLowerCase()}" data-id="${article.id}">
            <a href="${article.url}" target="_blank" rel="noopener noreferrer" class="card-img-wrap" onclick="markAsRead('${article.id}')">
                <img src="${imageUrl}" alt="${article.title}" class="card-img" loading="lazy" onerror="this.style.display='none'">
            </a>
            <div class="card-content">
                <div class="card-meta">
                    <span class="card-source">${article.source}</span>
                    <span>${formatTime(article.publishedAt)}</span>
                </div>
                <h2 class="card-title" title="${article.title}">
                    <a href="${article.url}" target="_blank" rel="noopener noreferrer" style="text-decoration:none; color:inherit;" onclick="markAsRead('${article.id}')">
                        ${article.title}
                    </a>
                </h2>
                <div class="card-actions">
                    <span class="chip-sm">${article.category}</span>
                </div>
            </div>
        </article>
    `;
}

// Generate HTML for a placeholder In-Feed Advertisement
function createAdCardHTML() {
    return `
        <article class="card ad-card" style="display: flex; align-items: center; justify-content: center; background: transparent; border: 1px dashed var(--border-color); box-shadow: none;">
            <div style="text-align: center; padding: 2rem; width: 100%;">
                <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-secondary); display: block; margin-bottom: 1rem;">Advertisement</span>
                <div style="width: 100%; height: 250px; background: rgba(128,128,128,0.05); display: flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); color: var(--text-secondary); font-weight: 500;">
                    Ad Space
                </div>
            </div>
        </article>
    `;
}

let heroSliderInterval = null;

// Initialize the Hero Slider logic
function initHeroSlider() {
    const slider = document.querySelector('.hero-slider');
    if (!slider) return;
    
    const slides = slider.querySelectorAll('.hero-slide');
    const dots = slider.querySelectorAll('.hero-dot');
    if (slides.length <= 1) return; // No need to slide if only 1 article

    let currentSlide = 0;
    const totalSlides = slides.length;

    const goToSlide = (index) => {
        slides[currentSlide].classList.remove('active');
        dots[currentSlide].classList.remove('active');
        
        currentSlide = index;
        
        slides[currentSlide].classList.add('active');
        dots[currentSlide].classList.add('active');
    };

    const nextSlide = () => {
        let next = (currentSlide + 1) % totalSlides;
        goToSlide(next);
    };

    const prevSlide = () => {
        let prev = (currentSlide - 1 + totalSlides) % totalSlides;
        goToSlide(prev);
    };

    // Auto advance every 5 seconds
    if (heroSliderInterval) clearInterval(heroSliderInterval);
    heroSliderInterval = setInterval(nextSlide, 5000);

    const pauseAutoPlay = () => clearInterval(heroSliderInterval);

    // Manual navigation (buttons)
    const prevBtn = slider.querySelector('.hero-nav-btn.prev');
    const nextBtn = slider.querySelector('.hero-nav-btn.next');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            pauseAutoPlay();
            prevSlide();
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            pauseAutoPlay();
            nextSlide();
        });
    }

    // Manual navigation (dots)
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            pauseAutoPlay();
            goToSlide(index);
        });
    });

    // Touch / Swipe Support
    let touchStartX = 0;
    let touchEndX = 0;

    slider.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
    }, {passive: true});

    slider.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, {passive: true});

    const handleSwipe = () => {
        const minSwipeDistance = 50;
        const swipeDistance = touchEndX - touchStartX;
        
        if (Math.abs(swipeDistance) > minSwipeDistance) {
            pauseAutoPlay();
            if (swipeDistance < 0) {
                // Swiped left
                nextSlide();
            } else {
                // Swiped right
                prevSlide();
            }
        }
    };
}

// Render the list of articles to the container
export function renderArticles(articles, containerId = 'news-container', append = false) {
    const gridContainer = document.getElementById(containerId);
    const heroContainer = document.getElementById('hero-container');
    
    if (!gridContainer || !heroContainer) return;

    if (!articles || articles.length === 0) {
        if (!append) {
            gridContainer.innerHTML = `
                <div style="grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; min-height: 60vh; color: var(--text-secondary);">
                    <h2>No news available right now.</h2>
                </div>
            `;
            heroContainer.innerHTML = '';
        }
        return;
    }

    let gridArticles = articles;

    // Only render Hero if we are NOT appending (i.e. initial load)
    if (!append) {
        const topArticles = articles.slice(0, 5); // Take up to 5 articles for slider
        if (topArticles.length > 0) {
            heroContainer.innerHTML = createHeroHTML(topArticles);
            heroContainer.style.display = 'block';
            gridArticles = articles.slice(topArticles.length);
            initHeroSlider();
        }
    }

    let html = '';
    gridArticles.forEach((article, index) => {
        html += createCardHTML(article);
        
        // Inject an advertisement every 5 articles
        if ((index + 1) % 5 === 0) {
            html += createAdCardHTML();
        }
    });
    
    if (append) {
        gridContainer.insertAdjacentHTML('beforeend', html);
    } else {
        gridContainer.innerHTML = html;
    }
}

// Filter articles by category
export function filterArticles(category) {
    const cards = document.querySelectorAll('.card');
    const heroContainer = document.getElementById('hero-container');
    
    // Hide Hero when filtering specific categories to give grid priority, unless it's 'all' or 'trending'
    if (category === 'all' || category === 'trending') {
        if(heroContainer.innerHTML.trim() !== '') heroContainer.style.display = 'block';
    } else {
        heroContainer.style.display = 'none';
    }

    cards.forEach(card => {
        if (card.classList.contains('ad-card')) {
            card.style.display = 'flex';
            return;
        }

        if (category === 'all' || card.dataset.category === category) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}
