/**
 * API module for fetching static news data.
 */

const DATA_URL = 'data/news.json';

export async function fetchNewsData() {
    try {
        // Append timestamp to prevent aggressive browser caching
        const response = await fetch(`${DATA_URL}?t=${new Date().getTime()}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.articles;
    } catch (error) {
        console.error("Could not fetch news data:", error);
        return [];
    }
}
