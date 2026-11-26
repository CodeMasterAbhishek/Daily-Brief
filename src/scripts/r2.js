import crypto from 'crypto';

export const ACCOUNT_ID_RE = /^[a-f0-9]{32}$/i;
export const BUCKET_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const REQUEST_TIMEOUT_MS = 15000;
const RETRY_DELAY_MS = 250;

function env(name) {
    return String(process.env[name] || '').trim();
}

export function r2Configured() {
    return Boolean(env('R2_ACCOUNT_ID') && env('R2_ACCESS_KEY_ID') && env('R2_SECRET_ACCESS_KEY') && env('R2_BUCKET'));
}

export function r2PublicBase() {
    return env('R2_PUBLIC_URL').replace(/\/+$/, '');
}

export function encodeRfc3986(value) {
    return encodeURIComponent(String(value))
        .replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function validateR2Key(key) {
    if (typeof key !== 'string' || !key.trim()) {
        throw new Error('Invalid R2 key: key must be a non-empty string');
    }
    if (key.startsWith('/') || /[\u0000-\u001F\u007F\\]/.test(key)) {
        throw new Error('Invalid R2 key: leading slash or control characters are not allowed');
    }
    const segments = key.split('/');
    if (segments.some(seg => !seg || seg === '.' || seg === '..') || key.includes('..')) {
        throw new Error('Invalid R2 key: path traversal is not allowed');
    }
    return key;
}

export function validateR2Config({ accountId, bucket, accessKey, secret }) {
    if (!ACCOUNT_ID_RE.test(accountId)) {
        throw new Error('Invalid R2_ACCOUNT_ID: expected 32 hexadecimal characters');
    }
    if (!BUCKET_RE.test(bucket)) {
        throw new Error('Invalid R2_BUCKET: expected 3-63 lowercase alphanumeric or hyphen characters');
    }
    if (!accessKey || !secret) {
        throw new Error('Missing R2 credentials: R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required');
    }
}

function sha256Hex(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key, data) {
    return crypto.createHmac('sha256', key).update(data).digest();
}

function signingKey(secret, dateStamp) {
    const kDate = hmac(`AWS4${secret}`, dateStamp);
    const kRegion = hmac(kDate, 'auto');
    const kService = hmac(kRegion, 's3');
    return hmac(kService, 'aws4_request');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function formatR2Error(method, key, status, bodyText) {
    const text = String(bodyText || '');
    const code = text.match(/<Code>([^<]+)<\/Code>/i)?.[1]?.trim();
    const message = text.match(/<Message>([^<]+)<\/Message>/i)?.[1]?.trim();
    const sanitized = [code, message]
        .filter(Boolean)
        .join(': ')
        .replace(/Credential=[^\s,;]+/gi, 'Credential=[REDACTED]')
        .replace(/Signature=[^\s,;]+/gi, 'Signature=[REDACTED]')
        .replace(/<AWSAccessKeyId>[^<]*<\/AWSAccessKeyId>/gi, '')
        .trim()
        .slice(0, 200);
    return sanitized
        ? `R2 ${method} ${key} failed: ${status} (${sanitized})`
        : `R2 ${method} ${key} failed: ${status}`;
}

async function signedRequest(method, key, body) {
    const accountId = env('R2_ACCOUNT_ID');
    const bucket = env('R2_BUCKET');
    const accessKey = env('R2_ACCESS_KEY_ID');
    const secret = env('R2_SECRET_ACCESS_KEY');
    validateR2Config({ accountId, bucket, accessKey, secret });
    validateR2Key(key);

    const host = `${accountId}.r2.cloudflarestorage.com`;
    const payload = body == null ? '' : body;
    const payloadHash = sha256Hex(payload);
    const canonicalUri = `/${encodeRfc3986(bucket)}/${key.split('/').map(encodeRfc3986).join('/')}`;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        const now = new Date();
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
        const dateStamp = amzDate.slice(0, 8);
        const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
        const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
        const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
        const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
        const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
        const signature = crypto.createHmac('sha256', signingKey(secret, dateStamp)).update(stringToSign).digest('hex');
        const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

        try {
            const response = await fetch(`https://${host}${canonicalUri}`, {
                method,
                headers: {
                    Authorization: authorization,
                    'x-amz-content-sha256': payloadHash,
                    'x-amz-date': amzDate,
                    'content-type': 'application/json'
                },
                body: method === 'GET' || method === 'HEAD' ? undefined : payload,
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
            });

            if ((response.status === 429 || response.status >= 500) && attempt === 0) {
                await response.body?.cancel?.().catch(() => {});
                await sleep(RETRY_DELAY_MS);
                continue;
            }
            return response;
        } catch (error) {
            if (attempt === 0) {
                await sleep(RETRY_DELAY_MS);
                continue;
            }
            throw error;
        }
    }
    throw new Error(`R2 ${method} ${key} failed after retry`);
}

export async function r2PutJson(key, value) {
    const body = typeof value === 'string' ? value : JSON.stringify(value);
    const response = await signedRequest('PUT', key, body);
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(formatR2Error('PUT', key, response.status, text));
    }
}

export async function r2GetJson(key) {
    const response = await signedRequest('GET', key, '');
    if (response.status === 404) return null;
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(formatR2Error('GET', key, response.status, text));
    }
    return response.json();
}
