import { initMetadata, fetchChunkData, currentMetadata } from './api.js';
import { renderArticles, filterArticles, showSkeletons, removeSkeletons } from './ui.js';

// Setup current year in footer
document.getElementById('year').textContent = new Date().getFullYear();

// Theme Management
const themeToggle = document.getElementById('theme-toggle');
const htmlEl = document.documentElement;

const ICONS = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>'
};

function setTheme(isDark) {
    if (isDark) {
        htmlEl.setAttribute('data-theme', 'dark');
        themeToggle.innerHTML = ICONS.sun;
        localStorage.setItem('theme', 'dark');
    } else {
        htmlEl.setAttribute('data-theme', 'light');
        themeToggle.innerHTML = ICONS.moon;
        localStorage.setItem('theme', 'light');
    }
}

const savedTheme = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    setTheme(true);
} else {
    setTheme(false);
}

themeToggle.addEventListener('click', () => {
    const isDark = htmlEl.getAttribute('data-theme') === 'dark';
    setTheme(!isDark);
});

// Fullscreen Management
const fullscreenToggle = document.getElementById('fullscreen-toggle');
const iconExpand = document.getElementById('icon-expand');
const iconCompress = document.getElementById('icon-compress');

if (fullscreenToggle) {
    fullscreenToggle.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    });

    document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement) {
            iconExpand.style.display = 'none';
            iconCompress.style.display = 'block';
        } else {
            iconExpand.style.display = 'block';
            iconCompress.style.display = 'none';
        }
    });
}

// Pagination State
let allArticles = [];
let currentCategory = sessionStorage.getItem('currentCategory') || 'all';
const ITEMS_PER_PAGE = 30;
let currentPage = 1;
let loadedChunksCount = 0;
let isFetchingChunk = false;

const paginationSection = document.getElementById('pagination');

async function loadNextChunkIfAvailable() {
    if (isFetchingChunk) return false;
    if (!currentMetadata || loadedChunksCount >= currentMetadata.chunks.length) return false;
    
    isFetchingChunk = true;
    paginationSection.style.display = 'none';
    showSkeletons('news-container', 15);
    
    const chunkName = currentMetadata.chunks[loadedChunksCount];
    const newArticles = await fetchChunkData(chunkName);
    
    // Deduplicate just in case of cross-chunk overlap during migration
    const existingIds = new Set(allArticles.map(a => a.id));
    const uniqueNew = newArticles.filter(a => !existingIds.has(a.id));
    
    allArticles = allArticles.concat(uniqueNew);
    loadedChunksCount++;
    isFetchingChunk = false;
    removeSkeletons('news-container');
    return true;
}

// Main Initialization
async function init() {
    const filterChips = document.querySelectorAll('.chip');
    filterChips.forEach(c => c.classList.remove('active'));
    const activeChip = document.querySelector(`.chip[data-category="${currentCategory}"]`);
    if (activeChip) activeChip.classList.add('active');

    try {
        await initMetadata();
        if (currentMetadata && currentMetadata.latest) {
            await loadNextChunkIfAvailable();
        }
        
        setTimeout(() => {
            renderPage();
        }, 300); 
    } catch (error) {
        console.error("Initialization failed:", error);
        document.getElementById('news-container').innerHTML = '<p style="color:red">Failed to load news. Please try again later.</p>';
    }
}

async function renderPage(append = false) {
    let filteredArticles = allArticles.filter(article => {
        if (currentCategory === 'all') return true;
        return article.category === currentCategory;
    });

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    let endIndex = startIndex + ITEMS_PER_PAGE;

    // If we don't have enough articles to fill the page, and there are more chunks, fetch them
    while (filteredArticles.length < endIndex && loadedChunksCount < (currentMetadata?.chunks?.length || 0)) {
        const fetchedMore = await loadNextChunkIfAvailable();
        if (fetchedMore) {
            filteredArticles = allArticles.filter(article => {
                if (currentCategory === 'all') return true;
                return article.category === currentCategory;
            });
        } else {
            break; // No more chunks available
        }
    }

    const articlesToShow = filteredArticles.slice(startIndex, endIndex);
    renderArticles(articlesToShow, 'news-container', append);

    if (endIndex < filteredArticles.length || loadedChunksCount < (currentMetadata?.chunks?.length || 0)) {
        paginationSection.style.display = 'block';
    } else {
        paginationSection.style.display = 'none';
        paginationSection.innerHTML = '<div style="opacity: 0.6; font-size: 0.9rem;">You have reached the end of the history.</div>';
        paginationSection.style.display = 'block';
    }
}

// Category Filtering and Drag & Drop
const filtersContainer = document.querySelector('.filters');
let draggedChip = null;

// Initialize custom order if saved
const savedOrder = JSON.parse(localStorage.getItem('categoryOrder'));
if (savedOrder && Array.isArray(savedOrder)) {
    const chipMap = new Map();
    document.querySelectorAll('.chip').forEach(chip => {
        chipMap.set(chip.dataset.category, chip);
    });
    
    filtersContainer.innerHTML = '';
    
    savedOrder.forEach(cat => {
        if (chipMap.has(cat)) {
            filtersContainer.appendChild(chipMap.get(cat));
            chipMap.delete(cat);
        }
    });
    
    chipMap.forEach(chip => {
        filtersContainer.appendChild(chip);
    });
}

function getDragAfterElement(container, x) {
    // Select all chips except the one currently being dragged
    const draggableElements = [...container.querySelectorAll('.chip:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

filtersContainer.addEventListener('dragover', (e) => {
    e.preventDefault(); 
    if (!draggedChip) return;
    
    const afterElement = getDragAfterElement(filtersContainer, e.clientX);
    if (afterElement == null) {
        filtersContainer.appendChild(draggedChip);
    } else {
        filtersContainer.insertBefore(draggedChip, afterElement);
    }
});

const filterChips = document.querySelectorAll('.chip');
filterChips.forEach(chip => {
    // Drag & Drop Listeners
    chip.setAttribute('draggable', true);
    
    chip.addEventListener('dragstart', (e) => {
        draggedChip = chip;
        chip.classList.add('dragging');
        chip.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', chip.dataset.category);
    });
    
    chip.addEventListener('dragend', () => {
        chip.classList.remove('dragging');
        chip.style.opacity = '1';
        draggedChip = null;
        
        // Save new order
        const currentOrder = Array.from(filtersContainer.querySelectorAll('.chip')).map(c => c.dataset.category);
        localStorage.setItem('categoryOrder', JSON.stringify(currentOrder));
    });

    // Click Listener
    chip.addEventListener('click', (e) => {
        filterChips.forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        
        currentCategory = e.target.dataset.category;
        sessionStorage.setItem('currentCategory', currentCategory);
        currentPage = 1;
        renderPage(false); 
    });
});

// Infinite Scroll Observer
const observerOptions = {
    root: null,
    rootMargin: '100px', 
    threshold: 0
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(async entry => {
        if (entry.isIntersecting && !isFetchingChunk) {
            // We only increment currentPage if we actually rendered something previously
            // But if we run out of filtered articles locally, renderPage will automatically fetch the next chunk anyway.
            currentPage++;
            await renderPage(true);
        }
    });
}, observerOptions);

observer.observe(paginationSection);

document.addEventListener('DOMContentLoaded', init);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./ServiceWorker.js')
            .catch(err => console.error('ServiceWorker registration failed: ', err));
    });
}
