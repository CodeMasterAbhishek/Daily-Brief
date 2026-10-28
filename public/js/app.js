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
let selectedDate = sessionStorage.getItem('selectedDate') || '';
const ITEMS_PER_PAGE = 30;
let currentPage = 1;
const loadedChunkNames = new Set();
let isFetchingChunk = false;

const paginationSection = document.getElementById('pagination');
const archiveDateInput = document.getElementById('archive-date');
const archiveLatestButton = document.getElementById('date-latest');
const archiveLabel = document.getElementById('archive-label');
const datePrevButton = document.getElementById('date-prev');
const dateNextButton = document.getElementById('date-next');

function todayKey() {
    return new Intl.DateTimeFormat('en-CA').format(new Date());
}

function toDayKey(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA').format(date);
}

function chunkNameForDay(day) {
    return day ? `news-${day.slice(0, 7)}` : null;
}

function shiftDay(day, delta) {
    const date = new Date(`${day}T12:00:00`);
    date.setDate(date.getDate() + delta);
    return new Intl.DateTimeFormat('en-CA').format(date);
}

function archiveBounds() {
    const months = (currentMetadata?.chunks || [])
        .map(name => name.replace(/^news-/, ''))
        .filter(Boolean)
        .sort();
    const today = todayKey();
    if (!months.length) return { min: '2024-07-01', max: today };
    const min = `${months[0]}-01`;
    const [year, month] = months[months.length - 1].split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const archiveEnd = `${months[months.length - 1]}-${String(lastDay).padStart(2, '0')}`;
    return { min, max: today > archiveEnd ? today : archiveEnd };
}

function matchesFilters(article) {
    if (selectedDate && toDayKey(article.publishedAt) !== selectedDate) return false;
    if (currentCategory === 'all') return true;
    if (currentCategory === 'trending') {
        if (selectedDate) return article.tier === 1 || article.trending === true;
        return article.trending === true || article.category === 'trending';
    }
    return article.category === currentCategory;
}

async function ensureChunkLoaded(chunkName) {
    if (!chunkName || loadedChunkNames.has(chunkName)) return loadedChunkNames.has(chunkName);
    isFetchingChunk = true;
    paginationSection.style.display = 'none';
    showSkeletons('news-container', 12);
    const newArticles = await fetchChunkData(chunkName);
    const existingIds = new Set(allArticles.map(article => article.id));
    allArticles = allArticles.concat(newArticles.filter(article => !existingIds.has(article.id)));
    loadedChunkNames.add(chunkName);
    isFetchingChunk = false;
    removeSkeletons('news-container');
    return newArticles.length > 0;
}

async function loadNextChunkIfAvailable() {
    if (isFetchingChunk || !currentMetadata?.chunks) return false;
    const next = currentMetadata.chunks.find(name => !loadedChunkNames.has(name));
    if (!next) return false;
    await ensureChunkLoaded(next);
    return true;
}

function updateArchiveChrome() {
    const { min, max } = archiveBounds();
    if (archiveDateInput) {
        archiveDateInput.min = min;
        archiveDateInput.max = max;
        archiveDateInput.value = selectedDate || '';
    }
    if (archiveLatestButton) archiveLatestButton.hidden = !selectedDate;
    if (datePrevButton) datePrevButton.disabled = Boolean(selectedDate && selectedDate <= min);
    if (dateNextButton) dateNextButton.disabled = Boolean(selectedDate && selectedDate >= max);

    if (archiveLabel) {
        if (selectedDate) {
            const readable = new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
            });
            archiveLabel.textContent = readable;
            archiveLabel.hidden = false;
        } else {
            archiveLabel.hidden = true;
            archiveLabel.textContent = '';
        }
    }
}

async function setSelectedDate(day) {
    selectedDate = day || '';
    if (selectedDate) sessionStorage.setItem('selectedDate', selectedDate);
    else sessionStorage.removeItem('selectedDate');
    currentPage = 1;
    updateArchiveChrome();
    await renderPage(false);
}

// Main Initialization
async function init() {
    const filterChips = document.querySelectorAll('.filters .chip');
    filterChips.forEach(c => c.classList.remove('active'));
    const activeChip = document.querySelector(`.filters .chip[data-category="${currentCategory}"]`);
    if (activeChip) activeChip.classList.add('active');

    try {
        await initMetadata();
        updateArchiveChrome();
        if (selectedDate) {
            await ensureChunkLoaded(chunkNameForDay(selectedDate));
        } else if (currentMetadata && currentMetadata.latest) {
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
    if (selectedDate) {
        await ensureChunkLoaded(chunkNameForDay(selectedDate));
    }

    let filteredArticles = allArticles.filter(matchesFilters);

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    let endIndex = startIndex + ITEMS_PER_PAGE;

    if (!selectedDate) {
        while (filteredArticles.length < endIndex && loadedChunkNames.size < (currentMetadata?.chunks?.length || 0)) {
            const fetchedMore = await loadNextChunkIfAvailable();
            if (fetchedMore) {
                filteredArticles = allArticles.filter(matchesFilters);
            } else {
                break;
            }
        }
    }

    const articlesToShow = filteredArticles.slice(startIndex, endIndex);
    const emptyMessage = selectedDate
        ? `No stories saved for ${new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.`
        : 'No news available right now.';
    renderArticles(articlesToShow, 'news-container', append, emptyMessage);

    const moreInMemory = endIndex < filteredArticles.length;
    const moreChunks = !selectedDate && loadedChunkNames.size < (currentMetadata?.chunks?.length || 0);
    if (moreInMemory || moreChunks) {
        paginationSection.style.display = 'block';
        paginationSection.innerHTML = '<div style="opacity: 0.6; font-size: 0.9rem;">Loading more articles...</div>';
    } else {
        paginationSection.innerHTML = `<div style="opacity: 0.6; font-size: 0.9rem;">${selectedDate ? 'That’s all for this day.' : 'You have reached the end of the history.'}</div>`;
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
    document.querySelectorAll('.filters .chip').forEach(chip => {
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

const filterChips = document.querySelectorAll('.filters .chip');
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
    chip.addEventListener('click', async (e) => {
        filterChips.forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        
        currentCategory = e.currentTarget.dataset.category;
        sessionStorage.setItem('currentCategory', currentCategory);
        currentPage = 1;
        await renderPage(false); 
    });
});

if (archiveDateInput) {
    archiveDateInput.addEventListener('change', async () => {
        await setSelectedDate(archiveDateInput.value);
    });
}

if (datePrevButton) {
    datePrevButton.addEventListener('click', async () => {
        const from = selectedDate || todayKey();
        await setSelectedDate(shiftDay(from, -1));
    });
}

if (dateNextButton) {
    dateNextButton.addEventListener('click', async () => {
        const from = selectedDate || todayKey();
        const { max } = archiveBounds();
        const next = shiftDay(from, 1);
        if (next > max) return;
        await setSelectedDate(next);
    });
}

if (archiveLatestButton) {
    archiveLatestButton.addEventListener('click', async () => {
        await setSelectedDate('');
    });
}

const homeLink = document.getElementById('home-link');
if (homeLink) {
    homeLink.addEventListener('click', async (event) => {
        event.preventDefault();
        await setSelectedDate('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// Infinite Scroll Observer
const observerOptions = {
    root: null,
    rootMargin: '100px', 
    threshold: 0
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(async entry => {
        if (entry.isIntersecting && !isFetchingChunk) {
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
