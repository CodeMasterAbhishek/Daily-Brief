(function () {
    var COUNTRY_KEY = 'dailyBriefCountry';
    var TIMEZONE_COUNTRY = {
        'Asia/Calcutta': 'IN', 'Asia/Kolkata': 'IN',
        'Europe/London': 'GB',
        'America/New_York': 'US', 'America/Chicago': 'US', 'America/Los_Angeles': 'US',
        'America/Denver': 'US', 'America/Phoenix': 'US', 'America/Detroit': 'US',
        'America/Indianapolis': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US',
        'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Montreal': 'CA',
        'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
        'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
        'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Australia/Hobart': 'AU',
        'Australia/Darwin': 'AU',
        'Asia/Tokyo': 'JP', 'Asia/Singapore': 'SG', 'Asia/Dubai': 'AE',
        'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Colombo': 'LK',
        'Asia/Kathmandu': 'NP', 'Asia/Bangkok': 'TH', 'Asia/Jakarta': 'ID',
        'Asia/Seoul': 'KR', 'Asia/Manila': 'PH', 'Asia/Kuala_Lumpur': 'MY',
        'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW',
        'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'CN', 'Asia/Taipei': 'CN',
        'Asia/Jerusalem': 'IL',
        'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Rome': 'IT',
        'Europe/Madrid': 'ES', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE',
        'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Stockholm': 'SE',
        'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI',
        'Europe/Warsaw': 'PL', 'Europe/Athens': 'GR', 'Europe/Lisbon': 'PT',
        'Europe/Dublin': 'IE', 'Europe/Moscow': 'RU', 'Europe/Istanbul': 'TR',
        'Pacific/Auckland': 'NZ', 'America/Sao_Paulo': 'BR',
        'Africa/Johannesburg': 'ZA', 'Africa/Cairo': 'EG',
        'America/Mexico_City': 'MX', 'America/Buenos_Aires': 'AR',
        'America/Bogota': 'CO', 'America/Santiago': 'CL', 'America/Lima': 'PE'
    };
    var COUNTRY_NAMES = {
        AE: 'United Arab Emirates', AR: 'Argentina', AT: 'Austria', AU: 'Australia',
        BD: 'Bangladesh', BE: 'Belgium', BR: 'Brazil', CA: 'Canada', CH: 'Switzerland',
        CL: 'Chile', CN: 'China', CO: 'Colombia', DE: 'Germany', DK: 'Denmark',
        EG: 'Egypt', ES: 'Spain', FI: 'Finland', FR: 'France', GB: 'United Kingdom',
        GR: 'Greece', ID: 'Indonesia', IE: 'Ireland', IL: 'Israel', IN: 'India',
        IT: 'Italy', JP: 'Japan', KR: 'South Korea', KW: 'Kuwait', LK: 'Sri Lanka',
        MX: 'Mexico', MY: 'Malaysia', NL: 'Netherlands', NO: 'Norway', NP: 'Nepal',
        NZ: 'New Zealand', PE: 'Peru', PH: 'Philippines', PK: 'Pakistan', PL: 'Poland',
        PT: 'Portugal', QA: 'Qatar', RU: 'Russia', SA: 'Saudi Arabia', SE: 'Sweden',
        SG: 'Singapore', TH: 'Thailand', TR: 'Türkiye', US: 'United States', ZA: 'South Africa'
    };

    function flagEmoji(code) {
        var clean = String(code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
        if (clean.length !== 2) return '';
        return String.fromCodePoint(127397 + clean.charCodeAt(0), 127397 + clean.charCodeAt(1));
    }

    function regionFromLocale(locale) {
        if (!locale) return null;
        try {
            if (typeof Intl !== 'undefined' && typeof Intl.Locale === 'function') {
                var region = new Intl.Locale(locale).region;
                if (region && /^[A-Z]{2}$/.test(region)) return region;
            }
        } catch (e) {}
        var parts = String(locale).split(/[-_]/).slice(1);
        for (var i = 0; i < parts.length; i += 1) {
            if (/^[A-Za-z]{2}$/.test(parts[i])) return parts[i].toUpperCase();
        }
        return null;
    }

    // 1. Pre-paint theme selection to avoid FOUC
    var savedTheme = null;
    try {
        savedTheme = localStorage.getItem('theme');
    } catch (e) {}
    var prefersDark = false;
    try {
        prefersDark = Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (e) {}
    var isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

    // 2. Pre-detect country synchronously (read-only; never persists to localStorage)
    var detected = null;
    try {
        var savedCountry = localStorage.getItem(COUNTRY_KEY);
        if (savedCountry && /^[A-Z]{2}$/.test(savedCountry)) {
            detected = savedCountry;
        }
    } catch (e) {}
    if (!detected) {
        try {
            var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (tz && TIMEZONE_COUNTRY[tz]) detected = TIMEZONE_COUNTRY[tz];
        } catch (e) {}
    }
    if (!detected) {
        try {
            var locale = Intl.DateTimeFormat().resolvedOptions().locale || navigator.language || '';
            detected = regionFromLocale(locale);
        } catch (e) {}
    }

    window.__INITIAL_COUNTRY__ = detected || null;
    window.__INITIAL_FLAG__ = flagEmoji(detected || 'US');

    var didHydrateCountry = false;
    function hydrateCountryBadge() {
        if (didHydrateCountry || window.__COUNTRY_HYDRATED__) return;
        didHydrateCountry = true;
        var flagEl = document.getElementById('country-btn-flag');
        var labelEl = document.getElementById('country-btn-label');
        var code = window.__INITIAL_COUNTRY__;
        if (flagEl && !flagEl.textContent) {
            flagEl.textContent = window.__INITIAL_FLAG__ || flagEmoji(code || 'US');
        }
        if (labelEl && code) {
            labelEl.textContent = COUNTRY_NAMES[code] || code;
        }
    }

    // 3. Initial grid skeletons before app.js finishes fetching archives
    function renderSkeletons() {
        var container = document.getElementById('news-container');
        if (!container) return;
        if (container.children.length > 0 && !container.querySelector('.preload-skeleton')) {
            window.removeEventListener('resize', renderSkeletons);
            return;
        }
        var width = window.innerWidth || document.documentElement.clientWidth || 1024;
        var height = window.innerHeight || document.documentElement.clientHeight || 768;
        var columns = width > 768 ? Math.max(1, Math.floor((width * 0.95) / 340)) : 1;
        var rows = Math.max(2, Math.ceil(height / 400));
        var total = columns * rows;
        var skeletonHTML = '<article class="card preload-skeleton"><div class="card-img-wrap skeleton"></div><div class="card-content"><div class="skeleton skeleton-text short"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text"></div></div></article>';
        container.innerHTML = skeletonHTML.repeat(total);
    }

    function onDomReady() {
        hydrateCountryBadge();
        renderSkeletons();
    }

    window.addEventListener('resize', renderSkeletons);
    if (document.readyState === 'loading') {
        document.addEventListener('readystatechange', function handleReady() {
            if (document.readyState !== 'loading') {
                document.removeEventListener('readystatechange', handleReady);
                onDomReady();
            }
        });
        document.addEventListener('DOMContentLoaded', onDomReady);
    } else {
        onDomReady();
    }
})();
