import {
    initMetadata,
    fetchChunkData,
    currentMetadata,
    currentCountry,
    countries,
    loadCountries,
    detectCountry,
    rememberCountry,
    forgetCountry,
    countryByCode,
    flagEmoji
} from './api.js';
import { renderArticles, showSkeletons, removeSkeletons, initializeUiListeners } from './ui.js';

function safeStorageGet(storage, key) {
    try {
        return storage.getItem(key);
    } catch {
        return null;
    }
}

function safeStorageSet(storage, key, value) {
    try {
        storage.setItem(key, value);
    } catch {}
}

function safeStorageRemove(storage, key) {
    try {
        storage.removeItem(key);
    } catch {}
}

// Setup current year in footer
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Theme Management
const themeToggle = document.getElementById('theme-toggle');
const htmlEl = document.documentElement;

const ICONS = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>'
};

function setTheme(isDark, persist = false) {
    if (isDark) {
        htmlEl.setAttribute('data-theme', 'dark');
        if (themeToggle) {
            themeToggle.innerHTML = ICONS.sun;
            themeToggle.setAttribute('aria-pressed', 'true');
        }
        if (persist) safeStorageSet(localStorage, 'theme', 'dark');
    } else {
        htmlEl.setAttribute('data-theme', 'light');
        if (themeToggle) {
            themeToggle.innerHTML = ICONS.moon;
            themeToggle.setAttribute('aria-pressed', 'false');
        }
        if (persist) safeStorageSet(localStorage, 'theme', 'light');
    }
}

const savedTheme = safeStorageGet(localStorage, 'theme');
const prefersDark = Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
setTheme(savedTheme === 'dark' || (!savedTheme && prefersDark), false);

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const isDark = htmlEl.getAttribute('data-theme') === 'dark';
        setTheme(!isDark, true);
    });
}

// Fullscreen Management
const fullscreenToggle = document.getElementById('fullscreen-toggle');
const iconExpand = document.getElementById('icon-expand');
const iconCompress = document.getElementById('icon-compress');

if (fullscreenToggle) {
    if (!document.fullscreenEnabled && !document.documentElement.requestFullscreen) {
        fullscreenToggle.hidden = true;
    } else {
        fullscreenToggle.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                const req = document.documentElement.requestFullscreen?.();
                if (req && typeof req.catch === 'function') {
                    req.catch(err => {
                        console.error(`Error attempting to enable fullscreen: ${err.message}`);
                    });
                }
            } else {
                const exit = document.exitFullscreen?.();
                if (exit && typeof exit.catch === 'function') {
                    exit.catch(() => {});
                }
            }
        });

        document.addEventListener('fullscreenchange', () => {
            const isFull = Boolean(document.fullscreenElement);
            if (iconExpand) iconExpand.style.display = isFull ? 'none' : 'block';
            if (iconCompress) iconCompress.style.display = isFull ? 'block' : 'none';
            fullscreenToggle.setAttribute('aria-pressed', isFull ? 'true' : 'false');
        });
    }
}

const DAY_KEY_FORMATTER = new Intl.DateTimeFormat('en-CA');
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VALID_CATEGORIES = new Set(
    Array.from(document.querySelectorAll('.filters .chip')).map(chip => chip.dataset.category)
);

function setActiveCategoryChip(category) {
    const normalized = VALID_CATEGORIES.has(category) ? category : 'all';
    document.querySelectorAll('.filters .chip').forEach(chip => {
        const isActive = chip.dataset.category === normalized;
        chip.classList.toggle('active', isActive);
        chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    return normalized;
}

const rawSavedCategory = safeStorageGet(sessionStorage, 'currentCategory');
let currentCategory = VALID_CATEGORIES.has(rawSavedCategory) ? rawSavedCategory : 'all';
const rawSavedDate = safeStorageGet(sessionStorage, 'selectedDate');
let selectedDate = (rawSavedDate && DATE_KEY_PATTERN.test(rawSavedDate) && !Number.isNaN(new Date(`${rawSavedDate}T12:00:00`).getTime()))
    ? rawSavedDate
    : '';
if (!selectedDate && rawSavedDate) safeStorageRemove(sessionStorage, 'selectedDate');

// Pagination & Fetch State
let allArticles = [];
const ITEMS_PER_PAGE = 30;
let currentPage = 1;
const loadedChunkNames = new Set();
let isFetchingChunk = false;
let hasMorePages = false;
let countryToken = 0;
let renderToken = 0;

const paginationSection = document.getElementById('pagination');
const heroContainer = document.getElementById('hero-container');
const newsContainer = document.getElementById('news-container');
const archiveDateBtn = document.getElementById('archive-date-btn');
const archiveCalendar = document.getElementById('archive-calendar');
const archiveCalGrid = document.getElementById('cal-grid');
const archiveCalMonthLabel = document.getElementById('cal-month-label');
const archiveLatestButton = document.getElementById('date-latest');
const datePrevButton = document.getElementById('date-prev');
const dateNextButton = document.getElementById('date-next');
const calPrevMonthButton = document.getElementById('cal-prev-month');
const calNextMonthButton = document.getElementById('cal-next-month');
let calendarMonth = new Date();
if (archiveCalendar) document.body.appendChild(archiveCalendar);

const countryBtn = document.getElementById('country-btn');
const countryBtnFlag = document.getElementById('country-btn-flag');
const countryBtnLabel = document.getElementById('country-btn-label');
const countryMenu = document.getElementById('country-menu');
const countrySearch = document.getElementById('country-search');
const countryList = document.getElementById('country-list');
const countryAuto = document.getElementById('country-auto');
if (countryMenu) document.body.appendChild(countryMenu);

function todayKey() {
    return DAY_KEY_FORMATTER.format(new Date());
}

function toDayKey(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return DAY_KEY_FORMATTER.format(date);
}

function chunkNamesForDay(day) {
    if (!day || !DATE_KEY_PATTERN.test(day)) return [];
    const start = new Date(`${day}T00:00:00`);
    const end = new Date(`${day}T23:59:59`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
    const candidates = [
        `news-${start.toISOString().slice(0, 7)}`,
        `news-${end.toISOString().slice(0, 7)}`
    ];
    const available = new Set(currentMetadata?.chunks || []);
    return [...new Set(candidates)].filter(name => available.has(name));
}

function shiftDay(day, delta) {
    const date = new Date(`${day}T12:00:00`);
    date.setDate(date.getDate() + delta);
    return DAY_KEY_FORMATTER.format(date);
}

function archiveBounds() {
    const months = (currentMetadata?.chunks || [])
        .map(name => name.replace(/^news-/, ''))
        .filter(month => /^\d{4}-\d{2}$/.test(month))
        .sort();
    const today = todayKey();
    if (!months.length) return { min: today, max: today };
    return { min: `${months[0]}-01`, max: today };
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

async function ensureChunkLoaded(chunkName, expectedCountryToken = countryToken) {
    if (!chunkName || !currentMetadata?.chunks?.includes(chunkName)) return false;
    if (loadedChunkNames.has(chunkName)) return true;

    const newArticles = await fetchChunkData(chunkName);
    if (expectedCountryToken !== countryToken) return false;

    const existingIds = new Set(allArticles.map(article => article.id));
    const additions = newArticles.filter(article => !existingIds.has(article.id));
    if (additions.length > 0) {
        allArticles = allArticles.concat(additions);
        allArticles.sort((a, b) => (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0));
    }
    loadedChunkNames.add(chunkName);
    return newArticles.length > 0;
}

function formatPickerLabel(day) {
    if (!day) return 'Latest';
    if (day === todayKey()) return 'Today';
    const date = new Date(`${day}T12:00:00`);
    const options = { day: 'numeric', month: 'short' };
    if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
    return date.toLocaleDateString(undefined, options);
}

function isCalendarOpen() {
    return Boolean(archiveCalendar && !archiveCalendar.hidden);
}

function positionCalendar() {
    if (!archiveCalendar || !archiveDateBtn || archiveCalendar.hidden) return;
    const rect = archiveDateBtn.getBoundingClientRect();
    const width = archiveCalendar.offsetWidth || 280;
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    archiveCalendar.style.top = `${Math.round(rect.bottom + 8)}px`;
    archiveCalendar.style.left = `${Math.round(left)}px`;
    archiveCalendar.style.right = 'auto';
}

function closeCalendar(restoreFocus = false) {
    if (!archiveCalendar || !archiveDateBtn) return;
    archiveCalendar.hidden = true;
    archiveDateBtn.setAttribute('aria-expanded', 'false');
    if (restoreFocus) archiveDateBtn.focus();
}

function openCalendar() {
    if (!archiveCalendar || !archiveDateBtn) return;
    const focus = selectedDate || todayKey();
    calendarMonth = new Date(`${focus}T12:00:00`);
    renderCalendar();
    archiveCalendar.hidden = false;
    archiveDateBtn.setAttribute('aria-expanded', 'true');
    positionCalendar();
}

function renderCalendar() {
    if (!archiveCalGrid || !archiveCalMonthLabel) return;
    const { min, max } = archiveBounds();
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    archiveCalMonthLabel.textContent = calendarMonth.toLocaleDateString(undefined, {
        month: 'long', year: 'numeric'
    });

    const lastDate = new Date(year, month + 1, 0).getDate();
    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const nextMonthStart = DAY_KEY_FORMATTER.format(new Date(year, month + 1, 1));
    if (calPrevMonthButton) calPrevMonthButton.disabled = monthStart <= min;
    if (calNextMonthButton) calNextMonthButton.disabled = nextMonthStart > max;

    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const today = todayKey();
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < firstWeekday; i += 1) {
        fragment.appendChild(document.createElement('span'));
    }

    for (let day = 1; day <= lastDate; day += 1) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = String(day);
        button.dataset.day = key;
        button.setAttribute('aria-label', new Date(`${key}T12:00:00`).toLocaleDateString(undefined, {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
        }));
        const hasChunk = chunkNamesForDay(key).length > 0;
        button.disabled = key < min || key > max || !hasChunk;
        if (key === today) button.classList.add('is-today');
        if (key === selectedDate) {
            button.classList.add('is-selected');
            button.setAttribute('aria-current', 'date');
        }
        fragment.appendChild(button);
    }

    archiveCalGrid.replaceChildren(fragment);
}

function updateArchiveChrome() {
    const { min } = archiveBounds();
    const hasChunks = Boolean(currentMetadata?.chunks?.length);
    if (archiveDateBtn) {
        archiveDateBtn.textContent = formatPickerLabel(selectedDate);
        archiveDateBtn.classList.toggle('is-archive', Boolean(selectedDate));
        archiveDateBtn.setAttribute('aria-label', selectedDate
            ? `Showing ${formatPickerLabel(selectedDate)}. Choose another date`
            : 'Latest news. Choose a date from the archive');
    }
    if (archiveLatestButton) archiveLatestButton.hidden = !selectedDate;
    if (datePrevButton) {
        datePrevButton.disabled = !hasChunks || (selectedDate ? selectedDate <= min : todayKey() <= min);
    }
    if (dateNextButton) {
        dateNextButton.disabled = !selectedDate;
    }
    if (isCalendarOpen()) renderCalendar();
}

async function setSelectedDate(day) {
    if (day && day > todayKey()) return;
    selectedDate = day || '';
    if (selectedDate) safeStorageSet(sessionStorage, 'selectedDate', selectedDate);
    else safeStorageRemove(sessionStorage, 'selectedDate');
    currentPage = 1;
    updateArchiveChrome();
    await renderPage(false);
}

function isCountryOpen() {
    return Boolean(countryMenu && !countryMenu.hidden);
}

function closeCountryMenu(restoreFocus = false) {
    if (!countryMenu || !countryBtn) return;
    countryMenu.hidden = true;
    countryBtn.setAttribute('aria-expanded', 'false');
    if (restoreFocus) countryBtn.focus();
}

function positionCountryMenu() {
    if (!countryMenu || !countryBtn || countryMenu.hidden) return;
    const rect = countryBtn.getBoundingClientRect();
    const width = countryMenu.offsetWidth || 320;
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    countryMenu.style.top = `${Math.round(rect.bottom + 8)}px`;
    countryMenu.style.left = `${Math.round(left)}px`;
    countryMenu.style.right = 'auto';
}

function updateCountryChrome(code = currentCountry) {
    if (typeof window !== 'undefined') window.__COUNTRY_HYDRATED__ = true;
    const country = countryByCode(code);
    const name = country?.name || code;
    if (countryBtnFlag) countryBtnFlag.textContent = flagEmoji(code);
    if (countryBtnLabel) countryBtnLabel.textContent = name;
    if (countryBtn) countryBtn.setAttribute('aria-label', `News country: ${name}. Choose another country`);
}

const COUNTRY_ALIASES = {
    CI: ['ivory coast'],
    CV: ['cape verde'],
    CZ: ['czech republic'],
    GB: ['uk', 'britain', 'great britain', 'england'],
    MK: ['macedonia'],
    NL: ['holland'],
    SZ: ['swaziland'],
    TR: ['turkey'],
    US: ['usa', 'america']
};

function normalizeSearchText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function renderCountryList(query = '') {
    if (!countryList) return;
    const needle = normalizeSearchText(query);
    const matches = countries.filter(country => {
        if (!needle) return true;
        if (normalizeSearchText(country.name).includes(needle)) return true;
        if (country.code.toLowerCase().includes(needle)) return true;
        const aliases = COUNTRY_ALIASES[country.code];
        return Boolean(aliases && aliases.some(alias => alias.includes(needle)));
    });
    const fragment = document.createDocumentFragment();
    if (matches.length === 0) {
        const emptyItem = document.createElement('li');
        emptyItem.setAttribute('role', 'none');
        emptyItem.className = 'country-empty';
        emptyItem.textContent = 'No matching countries';
        fragment.appendChild(emptyItem);
    } else {
        matches.forEach(country => {
            const item = document.createElement('li');
            item.setAttribute('role', 'none');
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.code = country.code;
            button.setAttribute('role', 'option');
            button.setAttribute('aria-selected', country.code === currentCountry ? 'true' : 'false');
            const flag = document.createElement('span');
            flag.className = 'country-flag';
            flag.setAttribute('aria-hidden', 'true');
            flag.textContent = flagEmoji(country.code);
            const label = document.createElement('span');
            label.textContent = country.name;
            button.append(flag, label);
            item.appendChild(button);
            fragment.appendChild(item);
        });
    }
    countryList.replaceChildren(fragment);
}

function openCountryMenu() {
    if (!countryMenu || !countryBtn) return;
    renderCountryList(countrySearch?.value || '');
    countryMenu.hidden = false;
    countryBtn.setAttribute('aria-expanded', 'true');
    positionCountryMenu();
    countrySearch?.focus();
}

function resetLoadedNews() {
    allArticles = [];
    loadedChunkNames.clear();
    currentPage = 1;
    hasMorePages = false;
    selectedDate = '';
    safeStorageRemove(sessionStorage, 'selectedDate');
}

function clearContainersToSkeletons() {
    if (heroContainer) {
        heroContainer.innerHTML = '';
        heroContainer.style.display = 'none';
    }
    if (newsContainer) {
        newsContainer.innerHTML = '';
        showSkeletons('news-container', 12);
    }
    if (paginationSection) {
        paginationSection.style.display = 'none';
    }
}

async function switchCountry(code, persist = true) {
    if (!code) return;
    const myCountryToken = ++countryToken;
    const myRenderToken = ++renderToken;
    const shouldRestoreFocus = Boolean(countryMenu?.contains(document.activeElement));

    closeCountryMenu(shouldRestoreFocus);
    closeCalendar();
    if (countrySearch) countrySearch.value = '';
    if (persist) rememberCountry(code);
    resetLoadedNews();
    isFetchingChunk = false;
    updateCountryChrome(code);
    clearContainersToSkeletons();

    await initMetadata(code);
    if (myCountryToken !== countryToken || myRenderToken !== renderToken) return;

    updateCountryChrome(code);
    updateArchiveChrome();
    await renderPage(false, myRenderToken, myCountryToken);
}

// Main Initialization
async function init() {
    initializeUiListeners();
    currentCategory = setActiveCategoryChip(currentCategory);

    try {
        const myCountryToken = countryToken;
        const myRenderToken = renderToken;

        await loadCountries();
        if (myCountryToken !== countryToken) return;

        const known = new Set(countries.map(country => country.code));
        const code = await detectCountry(known);
        if (myCountryToken !== countryToken) return;

        updateCountryChrome(code);
        await initMetadata(code);
        if (myCountryToken !== countryToken || myRenderToken !== renderToken) return;

        updateCountryChrome(code);
        if (selectedDate && selectedDate > todayKey()) {
            selectedDate = '';
            safeStorageRemove(sessionStorage, 'selectedDate');
        }
        updateArchiveChrome();
        await renderPage(false, myRenderToken, myCountryToken);
    } catch (error) {
        console.error('Initialization failed:', error);
        if (newsContainer) {
            newsContainer.innerHTML = '<p style="color:red">Failed to load news. Please try again later.</p>';
        }
    }
}

async function renderPage(append = false, explicitRenderToken = null, explicitCountryToken = null) {
    const myRenderToken = explicitRenderToken ?? ++renderToken;
    const myCountryToken = explicitCountryToken ?? countryToken;
    const availableChunks = currentMetadata?.chunks || [];

    if (selectedDate) {
        const needed = chunkNamesForDay(selectedDate).filter(name => !loadedChunkNames.has(name));
        if (needed.length > 0) {
            isFetchingChunk = true;
            if (!append) clearContainersToSkeletons();
            else {
                if (paginationSection) paginationSection.style.display = 'none';
                showSkeletons('news-container', 6);
            }
            for (const chunkName of needed) {
                if (myRenderToken !== renderToken || myCountryToken !== countryToken) return;
                await ensureChunkLoaded(chunkName, myCountryToken);
            }
            if (myRenderToken !== renderToken || myCountryToken !== countryToken) return;
            isFetchingChunk = false;
            removeSkeletons('news-container');
        }
    }

    let filteredArticles = allArticles.filter(matchesFilters);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;

    if (!selectedDate) {
        const hasUnloadedChunks = () => availableChunks.some(name => !loadedChunkNames.has(name));
        if (filteredArticles.length < endIndex && hasUnloadedChunks()) {
            isFetchingChunk = true;
            if (!append) clearContainersToSkeletons();
            else {
                if (paginationSection) paginationSection.style.display = 'none';
                showSkeletons('news-container', 6);
            }

            while (filteredArticles.length < endIndex && hasUnloadedChunks()) {
                if (myRenderToken !== renderToken || myCountryToken !== countryToken) return;
                const next = availableChunks.find(name => !loadedChunkNames.has(name));
                if (!next) break;
                await ensureChunkLoaded(next, myCountryToken);
                if (myRenderToken !== renderToken || myCountryToken !== countryToken) return;
                filteredArticles = allArticles.filter(matchesFilters);
            }

            isFetchingChunk = false;
            removeSkeletons('news-container');
        }
    }

    if (myRenderToken !== renderToken || myCountryToken !== countryToken) return;

    const articlesToShow = filteredArticles.slice(startIndex, endIndex);
    const countryName = countryByCode(currentCountry)?.name || currentCountry;
    const emptyMessage = selectedDate
        ? `No stories saved for ${new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.`
        : availableChunks.length
            ? 'No news available right now.'
            : `No stories for ${countryName} yet. Other countries fill in after Cloudflare storage is connected.`;
    renderArticles(articlesToShow, 'news-container', append, emptyMessage);

    const moreInMemory = endIndex < filteredArticles.length;
    const moreChunks = !selectedDate && availableChunks.some(name => !loadedChunkNames.has(name));
    hasMorePages = moreInMemory || moreChunks;

    if (!paginationSection) return;
    if (articlesToShow.length === 0 || filteredArticles.length === 0) {
        paginationSection.style.display = 'none';
        paginationSection.innerHTML = '';
    } else if (hasMorePages) {
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

if (filtersContainer) {
    try {
        const savedOrder = JSON.parse(safeStorageGet(localStorage, 'categoryOrder') || 'null');
        if (savedOrder && Array.isArray(savedOrder)) {
            const chipMap = new Map();
            filtersContainer.querySelectorAll('.chip').forEach(chip => {
                chipMap.set(chip.dataset.category, chip);
            });

            filtersContainer.innerHTML = '';
            savedOrder.forEach(cat => {
                if (chipMap.has(cat)) {
                    filtersContainer.appendChild(chipMap.get(cat));
                    chipMap.delete(cat);
                }
            });
            chipMap.forEach(chip => filtersContainer.appendChild(chip));
        }
    } catch {}

    function getDragAfterElement(container, x) {
        const draggableElements = [...container.querySelectorAll('.chip:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = x - box.left - box.width / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset, element: child };
            }
            return closest;
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

    const filterChips = filtersContainer.querySelectorAll('.chip');
    filterChips.forEach(chip => {
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

            const currentOrder = Array.from(filtersContainer.querySelectorAll('.chip')).map(c => c.dataset.category);
            safeStorageSet(localStorage, 'categoryOrder', JSON.stringify(currentOrder));
        });

        chip.addEventListener('click', async (e) => {
            const selected = e.currentTarget.dataset.category;
            currentCategory = setActiveCategoryChip(selected);
            safeStorageSet(sessionStorage, 'currentCategory', currentCategory);
            currentPage = 1;
            isFetchingChunk = false;
            await renderPage(false);
        });
    });
}

if (countryBtn) {
    countryBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        closeCalendar();
        if (isCountryOpen()) closeCountryMenu();
        else openCountryMenu();
    });
}

if (countrySearch) {
    countrySearch.addEventListener('input', () => {
        renderCountryList(countrySearch.value);
    });
}

if (countryMenu) {
    countryMenu.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const options = Array.from(countryList?.querySelectorAll('button[role="option"]') || []);
        if (!options.length) return;
        event.preventDefault();
        const currentIndex = options.indexOf(document.activeElement);
        if (event.key === 'ArrowDown') {
            const nextIndex = currentIndex === -1 ? 0 : Math.min(options.length - 1, currentIndex + 1);
            options[nextIndex].focus();
        } else if (currentIndex <= 0) {
            countrySearch?.focus();
        } else {
            options[currentIndex - 1].focus();
        }
    });
}

if (countryList) {
    countryList.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-code]');
        if (!button) return;
        await switchCountry(button.dataset.code, true);
    });
}

if (countryAuto) {
    countryAuto.addEventListener('click', async () => {
        forgetCountry();
        const known = new Set(countries.map(country => country.code));
        const code = await detectCountry(known);
        await switchCountry(code, false);
    });
}

if (archiveDateBtn) {
    archiveDateBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        closeCountryMenu();
        if (isCalendarOpen()) closeCalendar();
        else openCalendar();
    });
}

if (archiveCalGrid) {
    archiveCalGrid.addEventListener('click', async (event) => {
        const dayButton = event.target.closest('button[data-day]');
        if (!dayButton || dayButton.disabled) return;
        closeCalendar();
        await setSelectedDate(dayButton.dataset.day);
    });
}

if (calPrevMonthButton) {
    calPrevMonthButton.addEventListener('click', () => {
        calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
        renderCalendar();
    });
}

if (calNextMonthButton) {
    calNextMonthButton.addEventListener('click', () => {
        calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
        renderCalendar();
    });
}

document.addEventListener('click', (event) => {
    if (isCalendarOpen() && !event.target.closest('.archive-picker, .archive-calendar')) closeCalendar();
    if (isCountryOpen() && !event.target.closest('.country-picker, .country-menu')) closeCountryMenu();
});

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (isCalendarOpen()) closeCalendar(true);
    if (isCountryOpen()) closeCountryMenu(true);
});

window.addEventListener('resize', () => {
    positionCalendar();
    positionCountryMenu();
});

window.addEventListener('scroll', (event) => {
    if (event.target === countryList || countryMenu?.contains(event.target)) return;
    if (archiveCalendar?.contains(event.target)) return;
    positionCalendar();
    positionCountryMenu();
}, true);

if (datePrevButton) {
    datePrevButton.addEventListener('click', async () => {
        const from = selectedDate || todayKey();
        await setSelectedDate(shiftDay(from, -1));
    });
}

if (dateNextButton) {
    dateNextButton.addEventListener('click', async () => {
        if (!selectedDate) return;
        const today = todayKey();
        if (selectedDate >= today) {
            await setSelectedDate('');
            return;
        }
        const next = shiftDay(selectedDate, 1);
        await setSelectedDate(next > today ? '' : next);
    });
}

if (archiveLatestButton) {
    archiveLatestButton.addEventListener('click', async () => {
        closeCalendar();
        await setSelectedDate('');
    });
}

const homeLink = document.getElementById('home-link');
if (homeLink) {
    homeLink.addEventListener('click', async (event) => {
        event.preventDefault();
        closeCalendar();
        closeCountryMenu();
        currentCategory = setActiveCategoryChip('all');
        safeStorageSet(sessionStorage, 'currentCategory', currentCategory);
        isFetchingChunk = false;
        await setSelectedDate('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// Infinite Scroll Observer
if (paginationSection) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(async entry => {
            if (entry.isIntersecting && !isFetchingChunk && hasMorePages) {
                currentPage += 1;
                await renderPage(true);
            }
        });
    }, {
        root: null,
        rootMargin: '100px',
        threshold: 0
    });

    observer.observe(paginationSection);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./ServiceWorker.js')
            .catch(err => console.error('ServiceWorker registration failed: ', err));
    });
}
