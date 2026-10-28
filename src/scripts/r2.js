import crypto from 'crypto';

function env(name) {
    return String(process.env[name] || '').trim();
}

export function r2Configured() {
    return Boolean(env('R2_ACCOUNT_ID') && env('R2_ACCESS_KEY_ID') && env('R2_SECRET_ACCESS_KEY') && env('R2_BUCKET'));
}

export function r2PublicBase() {
    return env('R2_PUBLIC_URL').replace(/\/$/, '');
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

async function signedRequest(method, key, body) {
    const accountId = env('R2_ACCOUNT_ID');
    const bucket = env('R2_BUCKET');
    const accessKey = env('R2_ACCESS_KEY_ID');
    const secret = env('R2_SECRET_ACCESS_KEY');
    const host = `${accountId}.r2.cloudflarestorage.com`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payload = body == null ? '' : body;
    const payloadHash = sha256Hex(payload);
    const canonicalUri = `/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
    const signature = crypto.createHmac('sha256', signingKey(secret, dateStamp)).update(stringToSign).digest('hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const response = await fetch(`https://${host}${canonicalUri}`, {
        method,
        headers: {
            Authorization: authorization,
            'x-amz-content-sha256': payloadHash,
            'x-amz-date': amzDate,
            'content-type': 'application/json'
        },
        body: method === 'GET' || method === 'HEAD' ? undefined : payload
    });
    return response;
}

export async function r2PutJson(key, value) {
    const body = typeof value === 'string' ? value : JSON.stringify(value);
    const response = await signedRequest('PUT', key, body);
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`R2 PUT ${key} failed: ${response.status} ${text.slice(0, 200)}`);
    }
}

export async function r2GetJson(key) {
    const response = await signedRequest('GET', key, '');
    if (response.status === 404) return null;
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`R2 GET ${key} failed: ${response.status} ${text.slice(0, 200)}`);
    }
    return response.json();
}
