import { fetchNewsData } from './api.js';
import { renderArticles, filterArticles } from './ui.js';

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

// Initialize theme from local storage or system preference
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

// Pagination State
let allArticles = [];
let currentCategory = 'all';
const ITEMS_PER_PAGE = 30;
let currentPage = 1;

const paginationSection = document.getElementById('pagination');

// Main Initialization
async function init() {
    try {
        allArticles = await fetchNewsData();
        
        // Give a slight delay just to show off the skeleton loaders briefly
        setTimeout(() => {
            renderPage();
        }, 300); 
    } catch (error) {
        console.error("Initialization failed:", error);
        document.getElementById('news-container').innerHTML = '<p style="color:red">Failed to load news. Please try again later.</p>';
    }
}

function renderPage(append = false) {
    // Filter articles
    const filteredArticles = allArticles.filter(article => {
        if (currentCategory === 'all') return true;
        return article.category === currentCategory;
    });

    // Calculate slice
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const articlesToShow = filteredArticles.slice(startIndex, endIndex);

    // Render
    renderArticles(articlesToShow, 'news-container', append);

    // Show/Hide Load More button
    if (endIndex < filteredArticles.length) {
        paginationSection.style.display = 'block';
    } else {
        paginationSection.style.display = 'none';
    }
}

// Category Filtering
const filterChips = document.querySelectorAll('.chip');
filterChips.forEach(chip => {
    chip.addEventListener('click', (e) => {
        // Remove active class from all filters
        filterChips.forEach(c => c.classList.remove('active'));
        
        // Add to clicked
        e.target.classList.add('active');
        
        // Filter the UI and reset pagination
        currentCategory = e.target.dataset.category;
        currentPage = 1;
        renderPage(false); // don't append, replace
    });
});

// Infinite Scroll Observer
const observerOptions = {
    root: null,
    rootMargin: '100px', // Load a bit before it comes into view
    threshold: 0
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && paginationSection.style.display !== 'none') {
            currentPage++;
            renderPage(true);
        }
    });
}, observerOptions);

observer.observe(paginationSection);

// Start app
document.addEventListener('DOMContentLoaded', init);

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./ServiceWorker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(err => {
                console.error('ServiceWorker registration failed: ', err);
            });
    });
}
