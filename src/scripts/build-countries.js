import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// UN member states (193). English fallback = no single practical news language.
const ENGLISH = new Set([
    'IN', 'NG', 'KE', 'ZA', 'UG', 'TZ', 'GH', 'CM', 'RW', 'ZM', 'ZW', 'BW', 'NA',
    'MW', 'SL', 'LR', 'GM', 'PG', 'FJ', 'SG', 'PH', 'BE', 'CA', 'LK', 'SS', 'ER',
    'SZ', 'LS', 'MU', 'SC', 'MT', 'IE', 'NZ', 'AU', 'GB', 'US', 'GY', 'BZ', 'JM',
    'TT', 'BB', 'BS', 'AG', 'KN', 'LC', 'VC', 'GD', 'DM', 'PW', 'MH', 'FM', 'KI',
    'NR', 'TV', 'WS', 'TO', 'VU', 'SB'
]);

const LANG = {
    AF: 'ps', AL: 'sq', DZ: 'ar', AD: 'ca', AO: 'pt', AG: 'en', AR: 'es', AM: 'hy',
    AU: 'en', AT: 'de', AZ: 'az', BS: 'en', BH: 'ar', BD: 'bn', BB: 'en', BY: 'be',
    BE: 'en', BZ: 'en', BJ: 'fr', BT: 'dz', BO: 'es', BA: 'bs', BW: 'en', BR: 'pt-BR',
    BN: 'ms', BG: 'bg', BF: 'fr', BI: 'fr', CV: 'pt', KH: 'km', CM: 'en', CA: 'en',
    CF: 'fr', TD: 'fr', CL: 'es', CN: 'zh-CN', CO: 'es', KM: 'ar', CG: 'fr', CR: 'es',
    CI: 'fr', HR: 'hr', CU: 'es', CY: 'el', CZ: 'cs', CD: 'fr', DK: 'da', DJ: 'fr',
    DM: 'en', DO: 'es', EC: 'es', EG: 'ar', SV: 'es', GQ: 'es', ER: 'en', EE: 'et',
    SZ: 'en', ET: 'am', FJ: 'en', FI: 'fi', FR: 'fr', GA: 'fr', GM: 'en', GE: 'ka',
    DE: 'de', GH: 'en', GR: 'el', GD: 'en', GT: 'es', GN: 'fr', GW: 'pt', GY: 'en',
    HT: 'fr', HN: 'es', HU: 'hu', IS: 'is', IN: 'en', ID: 'id', IR: 'fa', IQ: 'ar',
    IE: 'en', IL: 'he', IT: 'it', JM: 'en', JP: 'ja', JO: 'ar', KZ: 'kk', KE: 'en',
    KI: 'en', KW: 'ar', KG: 'ky', LA: 'lo', LV: 'lv', LB: 'ar', LS: 'en', LR: 'en',
    LY: 'ar', LI: 'de', LT: 'lt', LU: 'fr', MG: 'fr', MW: 'en', MY: 'ms', MV: 'dv',
    ML: 'fr', MT: 'en', MH: 'en', MR: 'ar', MU: 'en', MX: 'es-419', FM: 'en', MD: 'ro',
    MC: 'fr', MN: 'mn', ME: 'sr', MA: 'ar', MZ: 'pt', MM: 'my', NA: 'en', NR: 'en',
    NP: 'ne', NL: 'nl', NZ: 'en', NI: 'es', NE: 'fr', NG: 'en', KP: 'ko', KR: 'ko', MK: 'mk',
    NO: 'nb', OM: 'ar', PK: 'ur', PW: 'en', PA: 'es', PG: 'en', PY: 'es', PE: 'es',
    PH: 'en', PL: 'pl', PT: 'pt-PT', QA: 'ar', RO: 'ro', RU: 'ru', RW: 'en', KN: 'en',
    LC: 'en', VC: 'en', WS: 'en', SM: 'it', ST: 'pt', SA: 'ar', SN: 'fr', RS: 'sr',
    SC: 'en', SL: 'en', SG: 'en', SK: 'sk', SI: 'sl', SB: 'en', SO: 'so', ZA: 'en',
    SS: 'en', ES: 'es', LK: 'en', SD: 'ar', SR: 'nl', SE: 'sv', CH: 'de', SY: 'ar',
    TJ: 'tg', TZ: 'en', TH: 'th', TL: 'pt', TG: 'fr', TO: 'en', TT: 'en', TN: 'ar',
    TR: 'tr', TM: 'tk', TV: 'en', UG: 'en', UA: 'uk', AE: 'ar', GB: 'en', US: 'en',
    UY: 'es', UZ: 'uz', VU: 'en', VE: 'es', VN: 'vi', YE: 'ar', ZM: 'en', ZW: 'en'
};

const NAMES = {
    AF: 'Afghanistan', AL: 'Albania', DZ: 'Algeria', AD: 'Andorra', AO: 'Angola',
    AG: 'Antigua and Barbuda', AR: 'Argentina', AM: 'Armenia', AU: 'Australia',
    AT: 'Austria', AZ: 'Azerbaijan', BS: 'Bahamas', BH: 'Bahrain', BD: 'Bangladesh',
    BB: 'Barbados', BY: 'Belarus', BE: 'Belgium', BZ: 'Belize', BJ: 'Benin',
    BT: 'Bhutan', BO: 'Bolivia', BA: 'Bosnia and Herzegovina', BW: 'Botswana',
    BR: 'Brazil', BN: 'Brunei', BG: 'Bulgaria', BF: 'Burkina Faso', BI: 'Burundi',
    CV: 'Cabo Verde', KH: 'Cambodia', CM: 'Cameroon', CA: 'Canada', CF: 'Central African Republic',
    TD: 'Chad', CL: 'Chile', CN: 'China', CO: 'Colombia', KM: 'Comoros',
    CG: 'Congo', CR: 'Costa Rica', CI: 'Côte d’Ivoire', HR: 'Croatia', CU: 'Cuba',
    CY: 'Cyprus', CZ: 'Czechia', CD: 'DR Congo', DK: 'Denmark', DJ: 'Djibouti',
    DM: 'Dominica', DO: 'Dominican Republic', EC: 'Ecuador', EG: 'Egypt', SV: 'El Salvador',
    GQ: 'Equatorial Guinea', ER: 'Eritrea', EE: 'Estonia', SZ: 'Eswatini', ET: 'Ethiopia',
    FJ: 'Fiji', FI: 'Finland', FR: 'France', GA: 'Gabon', GM: 'Gambia', GE: 'Georgia',
    DE: 'Germany', GH: 'Ghana', GR: 'Greece', GD: 'Grenada', GT: 'Guatemala',
    GN: 'Guinea', GW: 'Guinea-Bissau', GY: 'Guyana', HT: 'Haiti', HN: 'Honduras',
    HU: 'Hungary', IS: 'Iceland', IN: 'India', ID: 'Indonesia', IR: 'Iran', IQ: 'Iraq',
    IE: 'Ireland', IL: 'Israel', IT: 'Italy', JM: 'Jamaica', JP: 'Japan', JO: 'Jordan',
    KZ: 'Kazakhstan', KE: 'Kenya', KI: 'Kiribati', KW: 'Kuwait', KG: 'Kyrgyzstan',
    LA: 'Laos', LV: 'Latvia', LB: 'Lebanon', LS: 'Lesotho', LR: 'Liberia', LY: 'Libya',
    LI: 'Liechtenstein', LT: 'Lithuania', LU: 'Luxembourg', MG: 'Madagascar', MW: 'Malawi',
    MY: 'Malaysia', MV: 'Maldives', ML: 'Mali', MT: 'Malta', MH: 'Marshall Islands',
    MR: 'Mauritania', MU: 'Mauritius', MX: 'Mexico', FM: 'Micronesia', MD: 'Moldova',
    MC: 'Monaco', MN: 'Mongolia', ME: 'Montenegro', MA: 'Morocco', MZ: 'Mozambique',
    MM: 'Myanmar', NA: 'Namibia', NR: 'Nauru', NP: 'Nepal', NL: 'Netherlands',
    NZ: 'New Zealand', NI: 'Nicaragua', NE: 'Niger', NG: 'Nigeria', KP: 'North Korea', KR: 'South Korea',
    MK: 'North Macedonia', NO: 'Norway', OM: 'Oman', PK: 'Pakistan', PW: 'Palau',
    PA: 'Panama', PG: 'Papua New Guinea', PY: 'Paraguay', PE: 'Peru', PH: 'Philippines',
    PL: 'Poland', PT: 'Portugal', QA: 'Qatar', RO: 'Romania', RU: 'Russia', RW: 'Rwanda',
    KN: 'Saint Kitts and Nevis', LC: 'Saint Lucia', VC: 'Saint Vincent and the Grenadines',
    WS: 'Samoa', SM: 'San Marino', ST: 'Sao Tome and Principe', SA: 'Saudi Arabia',
    SN: 'Senegal', RS: 'Serbia', SC: 'Seychelles', SL: 'Sierra Leone', SG: 'Singapore',
    SK: 'Slovakia', SI: 'Slovenia', SB: 'Solomon Islands', SO: 'Somalia', ZA: 'South Africa',
    SS: 'South Sudan', ES: 'Spain', LK: 'Sri Lanka', SD: 'Sudan', SR: 'Suriname',
    SE: 'Sweden', CH: 'Switzerland', SY: 'Syria', TJ: 'Tajikistan', TZ: 'Tanzania',
    TH: 'Thailand', TL: 'Timor-Leste', TG: 'Togo', TO: 'Tonga', TT: 'Trinidad and Tobago',
    TN: 'Tunisia', TR: 'Türkiye', TM: 'Turkmenistan', TV: 'Tuvalu', UG: 'Uganda',
    UA: 'Ukraine', AE: 'United Arab Emirates', GB: 'United Kingdom', US: 'United States',
    UY: 'Uruguay', UZ: 'Uzbekistan', VU: 'Vanuatu', VE: 'Venezuela', VN: 'Vietnam',
    YE: 'Yemen', ZM: 'Zambia', ZW: 'Zimbabwe'
};

function ceidFor(gl, hl) {
    if (hl === 'zh-CN') return `${gl}:zh-Hans`;
    if (hl === 'pt-BR') return `${gl}:pt-419`;
    if (hl === 'es-419') return `${gl}:es-419`;
    if (hl === 'pt-PT') return `${gl}:pt-150`;
    const short = hl.split('-')[0];
    return `${gl}:${short}`;
}

const countries = Object.keys(NAMES).sort((a, b) => NAMES[a].localeCompare(NAMES[b])).map(code => {
    const english = ENGLISH.has(code);
    const hl = english ? (code === 'US' ? 'en-US' : code === 'GB' ? 'en-GB' : code === 'IN' ? 'en-IN' : 'en') : LANG[code];
    return {
        code,
        name: NAMES[code],
        language: english ? 'en' : hl.split('-')[0],
        englishFallback: english,
        hl,
        gl: code,
        ceid: ceidFor(code, hl)
    };
});

if (countries.length !== 193) {
    console.error(`Expected 193 countries, got ${countries.length}`);
    process.exit(1);
}

const out = path.join(__dirname, '../../public/data/countries.json');
fs.writeFileSync(out, JSON.stringify(countries, null, 2));
console.log(`Wrote ${countries.length} countries to ${out}`);
