const CATEGORIES = ['ai', 'technology', 'science', 'health', 'politics', 'business', 'entertainment', 'sports', 'gaming', 'trending'];

const PATH_RULES = [
    { category: 'ai', patterns: [/\/artificial-intelligence\b/, /\/machine-learning\b/, /\/ml\//, /\/llm\b/, /\/chatgpt\b/, /\/openai\b/, /\/ai-artificial-intelligence\b/, /\/category\/ai\b/, /\/tag\/ai\b/, /\/cs\.ai\b/] },
    { category: 'gaming', patterns: [/\/games\//, /\/gaming\//, /\/videogames\b/, /\/xbox\b/, /\/playstation\b/, /\/nintendo\b/] },
    { category: 'sports', patterns: [/\/sport\//, /\/sports\//, /\/nfl\b/, /\/nba\b/, /\/mlb\b/, /\/cricket\b/, /\/soccer\b/, /\/football\b/, /\/tennis\b/, /\/wnba\b/] },
    { category: 'health', patterns: [/\/health\b/, /\/wellbeing\b/, /\/wellness\b/, /\/medicine\b/, /\/fitness\b/, /\/nutrition\b/] },
    { category: 'science', patterns: [/\/science\b/, /\/space\b/, /\/physics\b/, /\/biology\b/, /\/climate\b/, /\/environment\b/, /\/cosmos\b/] },
    { category: 'politics', patterns: [/\/politics\b/, /\/election\b/, /\/policy\b/, /\/white-house\b/, /\/congress\b/, /\/world\/americas\b/] },
    { category: 'business', patterns: [/\/business\b/, /\/finance\b/, /\/economy\b/, /\/markets\b/, /\/money\b/, /\/wall-street\b/] },
    { category: 'entertainment', patterns: [/\/entertainment\b/, /\/movies\b/, /\/film\b/, /\/tv\b/, /\/music\b/, /\/arts\b/, /\/culture\b/, /\/celebrity\b/, /\/awards\b/] },
    { category: 'technology', patterns: [/\/technology\b/, /\/tech\//, /\/gadgets\b/, /\/phones\b/, /\/software\b/] }
];

const RSS_CATEGORY_MAP = [
    { category: 'ai', patterns: [/\bai\b/, /artificial intelligence/, /machine learning/, /deep learning/, /llm/] },
    { category: 'gaming', patterns: [/video ?games?/, /\bgaming\b/, /\bxbox\b/, /playstation/, /nintendo/] },
    { category: 'sports', patterns: [/\bsport/, /\bnfl\b/, /\bnba\b/, /cricket/, /soccer/, /tennis/] },
    { category: 'health', patterns: [/\bhealth\b/, /medicine/, /fitness/, /wellness/, /mental health/] },
    { category: 'science', patterns: [/\bscience\b/, /\bspace\b/, /physics/, /biology/, /climate/] },
    { category: 'politics', patterns: [/politics/, /election/, /government/, /world news/, /us news/] },
    { category: 'business', patterns: [/business/, /finance/, /economy/, /markets/, /earnings/] },
    { category: 'entertainment', patterns: [/entertainment/, /movies?/, /\btv\b/, /music/, /celebrity/, /culture/] },
    { category: 'technology', patterns: [/technology/, /\btech\b/, /gadgets?/] }
];

const KEYWORDS = {
    ai: [/\bchatgpt\b/i, /\bopenai\b/i, /\banthropic\b/i, /\bclaude\b/i, /\bllm\b/i, /\bgemini\b/i, /\bartificial intelligence\b/i, /\bmachine learning\b/i, /\bgenerative ai\b/i],
    gaming: [/\bgta\b/i, /\bxbox\b/i, /\bplaystation\b/i, /\bnintendo\b/i, /\bsteam\b/i, /\besport/i, /\bvideogame\b/i, /\bvideo game/i, /\bfortnite\b/i, /\bcall of duty\b/i],
    sports: [/\bnfl\b/i, /\bnba\b/i, /\bmlb\b/i, /\bnhl\b/i, /\bwnba\b/i, /\bpremier league\b/i, /\bworld cup\b/i, /\bcricket\b/i, /\bolympics\b/i, /\bwimbledon\b/i],
    health: [/\bvaccine\b/i, /\bcancer\b/i, /\bhospital\b/i, /\bcdc\b/i, /\bglp-1\b/i, /\bmental health\b/i, /\bclinical trial\b/i],
    politics: [/\belection\b/i, /\bsenate\b/i, /\bcongress\b/i, /\bwhite house\b/i, /\bgovernor\b/i, /\bprimary\b/i, /\bdemocrat\b/i, /\brepublican\b/i],
    business: [/\bearnings\b/i, /\bipo\b/i, /\binflation\b/i, /\bwall street\b/i, /\bstock market\b/i, /\bfederal reserve\b/i],
    entertainment: [/\bbox office\b/i, /\bemmy\b/i, /\boscar\b/i, /\btrailer\b/i, /\bnetflix\b/i, /\balbum\b/i, /\bcelebrity\b/i],
    science: [/\bnasa\b/i, /\bphysics\b/i, /\bastronomy\b/i, /\bquantum\b/i, /\bclimate change\b/i],
    technology: [/\biphone\b/i, /\bandroid\b/i, /\bsmartphone\b/i, /\bchipset\b/i, /\bsemiconductor\b/i]
};

function normalizeCategory(value) {
    const category = String(value || '').trim().toLowerCase();
    return CATEGORIES.includes(category) ? category : null;
}

function matchRules(text, rules) {
    if (!text) return null;
    for (const rule of rules) {
        if (rule.patterns.some(pattern => pattern.test(text))) return rule.category;
    }
    return null;
}

export function categoryFromUrl(urlString) {
    try {
        const url = new URL(urlString);
        const haystack = `${url.hostname}${url.pathname}`.toLowerCase();
        return matchRules(haystack, PATH_RULES);
    } catch {
        return null;
    }
}

export function categoryFromRss(categories = []) {
    const text = categories
        .flat()
        .map(value => String(value || '').toLowerCase())
        .join(' | ');
    return matchRules(text, RSS_CATEGORY_MAP);
}

export function categoryFromKeywords(title, description) {
    const text = `${title || ''} ${description || ''}`;
    const scores = {};
    for (const [category, patterns] of Object.entries(KEYWORDS)) {
        scores[category] = patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0);
    }
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [best, second] = ranked;
    if (!best || best[1] < 2) return null;
    if (second && best[1] - second[1] < 1) return null;
    return best[0];
}

export function classifyArticle({ title, description, url, rssCategories = [], defaultCategory }) {
    const fromUrl = categoryFromUrl(url);
    if (fromUrl) return fromUrl;

    const fromRss = categoryFromRss(rssCategories);
    if (fromRss) return fromRss;

    const fromKeywords = categoryFromKeywords(title, description);
    if (fromKeywords) return fromKeywords;

    return normalizeCategory(defaultCategory) || 'trending';
}

export function isTrendingArticle(article, feed, now = Date.now()) {
    const published = Date.parse(article.publishedAt);
    if (!Number.isFinite(published)) return false;
    const maxAgeMs = 72 * 60 * 60 * 1000;
    if (now - published > maxAgeMs) return false;
    return Boolean(feed?.homepage) || Number(feed?.tier) === 1;
}

export function applyFeedPolicy(article, feed) {
    return {
        id: article.id,
        title: article.title,
        description: article.description || '',
        url: article.url,
        image: article.image,
        source: article.source,
        category: classifyArticle({
            title: article.title,
            description: article.description,
            url: article.url,
            rssCategories: article.rssCategories || [],
            defaultCategory: feed?.category || article.category
        }),
        publishedAt: article.publishedAt,
        tier: Number(feed?.tier) || 2,
        trending: isTrendingArticle(article, feed)
    };
}
