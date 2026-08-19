/**
 * API module for fetching static chunked news data.
 */

const BASE_URL = 'data';
export let currentMetadata = null;

export async function initMetadata() {
    try {
        const response = await fetch(`${BASE_URL}/metadata.json?t=${new Date().getTime()}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        currentMetadata = await response.json();
        return currentMetadata;
    } catch (error) {
        console.error("Could not fetch metadata:", error);
        // Fallback for transition period if metadata doesn't exist yet
        currentMetadata = { latest: 'news', chunks: ['news'] };
        return currentMetadata;
    }
}

export async function fetchChunkData(chunkName) {
    try {
        const response = await fetch(`${BASE_URL}/${chunkName}.json?t=${new Date().getTime()}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        return data.articles || [];
    } catch (error) {
        console.error(`Could not fetch chunk ${chunkName}:`, error);
        return [];
    }
}
