/**
 * Keep real reporting, drop shopping/affiliate spam, prefer known outlets.
 */

import { BLOCKED_HOSTS, COUNTRY_DOMAINS, GLOBAL_QUALITY_DOMAINS } from './quality-domains.js';

export { BLOCKED_HOSTS, COUNTRY_DOMAINS, GLOBAL_QUALITY_DOMAINS };

export const GLOBAL_QUALITY = [
    'Reuters', 'Associated Press', 'AP News', 'AP ', 'Agence France-Presse', 'AFP',
    'BBC', 'Al Jazeera', 'Deutsche Welle', 'DW News', 'NHK', 'France 24',
    'The Guardian', 'New York Times', 'NYTimes', 'Washington Post', 'The Economist',
    'Financial Times', 'Bloomberg', 'NPR', 'PBS', 'Sky News', 'ABC News',
    'CBC', 'CTV', 'The Associated Press'
];

export const COUNTRY_QUALITY = {
    AF: ['TOLO', 'Pajhwok', 'Ariana News'],
    AL: ['Tirana Times', 'Balkan Insight', 'Exit.al'],
    DZ: ['El Watan', 'APS', 'TSA Algérie'],
    AD: ['Diari d’Andorra', 'Bondia'],
    AO: ['Jornal de Angola', 'Angop'],
    AG: ['Antigua Observer', 'The Daily Observer'],
    AR: ['La Nación', 'Clarín', 'Página/12', 'Infobae', 'Telam'],
    AM: ['Armenpress', 'CivilNet', 'Hetq'],
    AU: ['ABC Australia', 'ABC News', 'Sydney Morning Herald', 'The Age', 'The Australian', 'SBS'],
    AT: ['Der Standard', 'Die Presse', 'ORF', 'Wiener Zeitung'],
    AZ: ['APA', 'Trend News', 'Azertag'],
    BS: ['The Nassau Guardian', 'The Tribune'],
    BH: ['Gulf Daily News', 'Bahrain News Agency'],
    BD: ['The Daily Star', 'bdnews24', 'Prothom Alo', 'Dhaka Tribune'],
    BB: ['Nation News', 'Barbados Today'],
    BY: ['Belsat', 'Nasha Niva', 'Tut.by', 'BelTA'],
    BE: ['De Standaard', 'Le Soir', 'VRT', 'RTBF', 'Knack'],
    BZ: ['Amandala', 'Breaking Belize News'],
    BJ: ['La Nation', '24 Heures au Bénin'],
    BT: ['Kuensel', 'BBS'],
    BO: ['La Razón', 'El Deber', 'Página Siete'],
    BA: ['Balkan Insight', 'N1', 'Klix'],
    BW: ['Mmegi', 'Sunday Standard'],
    BR: ['Folha de S.Paulo', 'O Globo', 'Estadão', 'G1', 'Valor', 'Agência Brasil'],
    BN: ['Borneo Bulletin', 'The Scoop'],
    BG: ['Mediapool', 'Dnevnik', 'BTA', 'Capital'],
    BF: ['Sidwaya', 'Le Faso'],
    BI: ['Iwacu', 'ABP'],
    CV: ['A Semana', 'Inforpress'],
    KH: ['The Phnom Penh Post', 'Khmer Times', 'VOD'],
    CM: ['Cameroon Tribune', 'Journal du Cameroun'],
    CA: ['CBC', 'The Globe and Mail', 'National Post', 'CTV', 'La Presse', 'Toronto Star'],
    CF: ['RJDH', 'Radio Ndeke Luka'],
    TD: ['Alwihda', 'Tchadinfos'],
    CL: ['El Mercurio', 'La Tercera', 'BioBioChile', 'CIPER'],
    CN: ['Xinhua', 'Caixin', 'South China Morning Post', 'SCMP', 'CGTN', 'People’s Daily'],
    CO: ['El Tiempo', 'El Espectador', 'Semana', 'La Silla Vacía'],
    KM: ['Al-Watwan', 'La Gazette des Comores'],
    CG: ['Les Dépêches de Brazzaville', 'ADIAC'],
    CR: ['La Nación', 'Semanario Universidad', 'CRHoy'],
    CI: ['Fraternité Matin', 'Abidjan.net', 'APA'],
    HR: ['Jutarnji list', 'Večernji list', 'HRT', 'Index.hr'],
    CU: ['Granma', 'CubaDebate', '14ymedio'],
    CY: ['Cyprus Mail', 'Philenews', 'In-Cyprus'],
    CZ: ['Czech Radio', 'iROZHLAS', 'Hospodářské noviny', 'Respekt', 'CTK'],
    CD: ['Radio Okapi', 'Actualite.cd'],
    DK: ['DR', 'Politiken', 'Berlingske', 'Information'],
    DJ: ['La Nation', 'ADI'],
    DM: ['Dominica News Online', 'The Sun'],
    DO: ['Listín Diario', 'Diario Libre', 'El Caribe'],
    EC: ['El Comercio', 'El Universo', 'Primicias'],
    EG: ['Al-Ahram', 'Mada Masr', 'Ahram Online', 'Egypt Independent'],
    SV: ['La Prensa Gráfica', 'El Faro', 'El Diario de Hoy'],
    GQ: ['Guinea Ecuatorial Press', 'AhoraEG'],
    ER: ['Shabait', 'Eritrea Profile'],
    EE: ['ERR', 'Postimees', 'Eesti Päevaleht'],
    SZ: ['Times of Eswatini', 'Eswatini Observer'],
    ET: ['Addis Standard', 'The Ethiopian Herald', 'ENA'],
    FJ: ['Fiji Times', 'FBC News'],
    FI: ['Yle', 'Helsingin Sanomat', 'Iltalehti'],
    FR: ['Le Monde', 'Le Figaro', 'Libération', 'France Télévisions', 'AFP', 'Mediapart', 'France Info'],
    GA: ['Gabon Review', 'L’Union'],
    GM: ['The Point', 'The Standard'],
    GE: ['Civil.ge', 'Agenda.ge', 'OC Media'],
    DE: ['Der Spiegel', 'Die Zeit', 'Süddeutsche Zeitung', 'Frankfurter Allgemeine', 'ARTE', 'Tagesschau', 'ZDF', 'DW'],
    GH: ['Graphic Online', 'JoyNews', 'GhanaWeb', 'Citi Newsroom'],
    GR: ['Kathimerini', 'ekathimerini', 'Naftemporiki', 'ERT'],
    GD: ['NOW Grenada', 'The New Today'],
    GT: ['Prensa Libre', 'elPeriódico', 'Plaza Pública'],
    GN: ['Guineematin', 'Africaguinee'],
    GW: ['O Democrata', 'ANG'],
    GY: ['Stabroek News', 'News Room Guyana', 'Kaieteur News'],
    HT: ['Le Nouvelliste', 'AyiboPost'],
    HN: ['La Prensa', 'El Heraldo', 'Criterio.hn'],
    HU: ['Telex', '444.hu', 'HVG', 'MTI'],
    IS: ['RÚV', 'Morgunblaðið', 'Vísir'],
    IN: ['The Hindu', 'Indian Express', 'NDTV', 'The Wire', 'Scroll.in', 'The Print', 'Mint', 'Business Standard', 'Hindustan Times', 'PTI', 'All India Radio'],
    ID: ['Kompas', 'Tempo', 'The Jakarta Post', 'CNN Indonesia', 'Antara'],
    IR: ['IRNA', 'Tehran Times', 'ISNA'],
    IQ: ['Rudaw', 'Iraqi News Agency', 'The National Iraq'],
    IE: ['RTÉ', 'The Irish Times', 'Irish Independent', 'The Journal'],
    IL: ['Haaretz', 'The Times of Israel', 'Jerusalem Post', 'Ynet', 'i24NEWS'],
    IT: ['Corriere della Sera', 'La Repubblica', 'ANSA', 'Il Sole 24 Ore', 'RAI'],
    JM: ['The Gleaner', 'Jamaica Observer', 'Radio Jamaica'],
    JP: ['NHK', 'The Japan Times', 'Asahi Shimbun', 'Mainichi', 'Kyodo', 'Nikkei'],
    JO: ['The Jordan Times', 'Ammon News', 'Petra'],
    KZ: ['Kazinform', 'The Astana Times', 'Vlast'],
    KE: ['Daily Nation', 'The Standard', 'Citizen Digital', 'Capital FM'],
    KI: ['Kiribati News', 'RNZ Pacific'],
    KW: ['Kuwait Times', 'Arab Times', 'KUNA'],
    KG: ['24.kg', 'AKIpress', 'Kloop'],
    LA: ['Vientiane Times', 'KPL'],
    LV: ['LSM', 'Delfi', 'Latvijas Avīze'],
    LB: ['L’Orient-Le Jour', 'The Daily Star', 'Annahar', 'Naharnet'],
    LS: ['Lesotho Times', 'Sunday Express'],
    LR: ['FrontPage Africa', 'Daily Observer'],
    LY: ['Libya Herald', 'LANA'],
    LI: ['Liechtensteiner Vaterland', 'Volksblatt'],
    LT: ['LRT', 'Delfi', '15min'],
    LU: ['Luxemburger Wort', 'RTL Luxembourg', 'Tageblatt'],
    MG: ['L’Express de Madagascar', 'Midi Madagasikara'],
    MW: ['The Nation Malawi', 'Nyasa Times', 'Times Malawi'],
    MY: ['The Star', 'Malaysiakini', 'Bernama', 'New Straits Times'],
    MV: ['Sun.mv', 'Avas', 'PSM News'],
    ML: ['L’Essor', 'Studio Tamani'],
    MT: ['Times of Malta', 'MaltaToday', 'TVM'],
    MH: ['The Marshall Islands Journal', 'RNZ Pacific'],
    MR: ['AMI', 'Alakhbar'],
    MU: ['L’Express', 'Le Mauricien', 'Defi Media'],
    MX: ['Reforma', 'El Universal', 'La Jornada', 'Animal Político', 'Expansión'],
    FM: ['The Kaselehlie Press', 'RNZ Pacific'],
    MD: ['Ziarul de Gardă', 'NewsMaker', 'IPN'],
    MC: ['Monaco-Matin', 'Monaco Tribune'],
    MN: ['The UB Post', 'Montsame', 'gogo.mn'],
    ME: ['Vijesti', 'Pobjeda', 'RTCG'],
    MA: ['Le Matin', 'Hespress', 'TelQuel', 'MAP'],
    MZ: ['Notícias', 'O País', 'AIM'],
    MM: ['Myanmar Now', 'The Irrawaddy', 'Frontier Myanmar', 'Mizzima'],
    NA: ['The Namibian', 'New Era', 'Namibia Press Agency'],
    NR: ['Nauru Media Bureau', 'RNZ Pacific'],
    NP: ['The Kathmandu Post', 'Kantipur', 'Republica', 'Nepali Times'],
    NL: ['NOS', 'NRC', 'De Volkskrant', 'Trouw', 'ANP'],
    NZ: ['RNZ', 'Stuff', 'NZ Herald', 'Newsroom'],
    NI: ['La Prensa', 'Confidencial', 'El Nuevo Diario'],
    NE: ['Le Sahel', 'ActuNiger'],
    NG: ['The Punch', 'Premium Times', 'The Guardian Nigeria', 'Channels TV', 'Vanguard', 'Daily Trust'],
    KP: ['KCNA', 'Rodong Sinmun'],
    KR: ['Yonhap', 'The Korea Herald', 'Korea JoongAng Daily', 'KBS', 'Hankyoreh', 'Chosun'],
    MK: ['MIA', 'Meta.mk', 'Sloboden Pečat'],
    NO: ['NRK', 'Aftenposten', 'VG', 'Dagens Næringsliv'],
    OM: ['Times of Oman', 'Oman Observer', 'Muscat Daily'],
    PK: ['Dawn', 'The News', 'Geo News', 'Express Tribune', 'ARY News'],
    PW: ['Island Times', 'RNZ Pacific'],
    PA: ['La Prensa', 'TVN', 'Mi Diario'],
    PG: ['Post-Courier', 'The National PNG'],
    PY: ['ABC Color', 'Última Hora', 'La Nación Paraguay'],
    PE: ['El Comercio', 'La República', 'RPP', 'Ojo Público'],
    PH: ['Rappler', 'Philippine Daily Inquirer', 'ABS-CBN', 'GMA News', 'Philstar'],
    PL: ['Gazeta Wyborcza', 'Rzeczpospolita', 'TVN24', 'PAP', 'Polityka'],
    PT: ['Público', 'Diário de Notícias', 'RTP', 'Expresso', 'Lusa'],
    QA: ['Al Jazeera', 'The Peninsula', 'Gulf Times', 'QNA'],
    RO: ['Digi24', 'G4Media', 'Adevărul', 'HotNews', 'Agerpres'],
    RU: ['TASS', 'Interfax', 'Meduza', 'Novaya Gazeta', 'Kommersant', 'RBC', 'The Moscow Times'],
    RW: ['The New Times', 'KT Press', 'Igihe'],
    KN: ['Winn FM', 'SKNVibes'],
    LC: ['St. Lucia Times', 'The Voice'],
    VC: ['Searchlight', 'iWitness News'],
    WS: ['Samoa Observer', 'RNZ Pacific'],
    SM: ['San Marino RTV', 'Libertas'],
    ST: ['Téla Nón', 'STP-Press'],
    SA: ['Arab News', 'Saudi Gazette', 'Asharq Al-Awsat', 'SPA'],
    SN: ['Le Soleil', 'Sud Quotidien', 'APS'],
    RS: ['N1', 'BIRN', 'RTS', 'Danas', 'Cenzolovka'],
    SC: ['Seychelles News Agency', 'Nation Seychelles'],
    SL: ['Awoko', 'Concord Times'],
    SG: ['The Straits Times', 'CNA', 'Channel News Asia', 'Mothership', 'TODAY'],
    SK: ['SME', 'Denník N', 'TASR', 'RTVS'],
    SI: ['RTV Slovenija', 'Delo', 'STA'],
    SB: ['Solomon Star', 'RNZ Pacific'],
    SO: ['Hiiraan', 'Garowe Online', 'Radio Dalsan'],
    ZA: ['News24', 'Daily Maverick', 'Mail & Guardian', 'TimesLIVE', 'SABC', 'GroundUp'],
    SS: ['Radio Tamazuj', 'Eye Radio', 'Sudans Post'],
    ES: ['El País', 'El Mundo', 'RTVE', 'La Vanguardia', 'EFE', 'elDiario.es'],
    LK: ['Daily Mirror', 'News First', 'The Island', 'Ada Derana'],
    SD: ['Radio Dabanga', 'SUNA', 'Sudan Tribune'],
    SR: ['De Ware Tijd', 'Starnieuws'],
    SE: ['SVT', 'Dagens Nyheter', 'Svenska Dagbladet', 'TT'],
    CH: ['SRF', 'NZZ', 'Le Temps', 'RTS', 'Tages-Anzeiger'],
    SY: ['SANA', 'Enab Baladi', 'Syria Direct'],
    TJ: ['Asia-Plus', 'Khovar'],
    TZ: ['The Citizen', 'Daily News Tanzania', 'Mwananchi'],
    TH: ['Bangkok Post', 'The Nation Thailand', 'Thai PBS', 'Khaosod'],
    TL: ['Tatoli', 'Lusa Timor'],
    TG: ['Togofirst', 'Republicoftogo'],
    TO: ['Matangi Tonga', 'RNZ Pacific'],
    TT: ['Trinidad Express', 'Newsday', 'Guardian T&T'],
    TN: ['TAP', 'Nawaat', 'La Presse de Tunisie', 'Business News'],
    TR: ['Anadolu Agency', 'Hürriyet Daily News', 'Bianet', 'Duvar', 'TRT World'],
    TM: ['Turkmenistan.gov', 'Chronicles of Turkmenistan'],
    TV: ['Tuvalu News', 'RNZ Pacific'],
    UG: ['Daily Monitor', 'New Vision', 'The Independent Uganda'],
    UA: ['Ukrinform', 'Kyiv Independent', 'Ukrainska Pravda', 'Suspilne', 'NV'],
    AE: ['The National', 'Gulf News', 'WAM', 'Khaleej Times'],
    GB: ['BBC', 'The Guardian', 'Financial Times', 'The Times', 'Reuters', 'Sky News', 'The Independent', 'The Economist'],
    US: ['Reuters', 'Associated Press', 'AP News', 'New York Times', 'Washington Post', 'NPR', 'PBS', 'The Atlantic', 'ProPublica', 'WSJ', 'Wall Street Journal', 'NBC News', 'CBS News', 'ABC News', 'The New Yorker', 'Ars Technica', 'TechCrunch', 'The Verge', 'Wired', 'Engadget', 'CNET', 'MIT Technology Review', 'The Economist', 'Fortune', 'CNBC', 'Nature', 'NASA', 'Quanta', 'STAT', 'Variety', 'Hollywood Reporter', 'Rolling Stone', 'Polygon', 'BBC', 'CNN', 'KFF Health News'],
    UY: ['El País Uruguay', 'La Diaria', 'El Observador', 'Búsqueda'],
    UZ: ['Gazeta.uz', 'Kun.uz', 'Podrobno'],
    VU: ['Daily Post Vanuatu', 'RNZ Pacific'],
    VE: ['Efecto Cocuyo', 'Tal Cual', 'El Nacional', 'Runrun.es'],
    VN: ['VnExpress', 'Tuoi Tre', 'VietnamNews', 'Thanh Nien'],
    YE: ['Saba', 'Al-Masdar Online'],
    ZM: ['News Diggers', 'Times of Zambia', 'Zambia Daily Mail'],
    ZW: ['The Herald', 'NewsDay', 'ZimLive', 'The Standard Zimbabwe']
};

const PROMO_TITLE = [
    /\bpromo codes?\b/i,
    /\bcoupon codes?\b/i,
    /\bdiscount codes?\b/i,
    /\bvoucher codes?\b/i,
    /\buse code\b/i,
    /\d%\s*off\b/i,
    /\bsave \d+%/i,
    /\bfree trial\b/i,
    /\bsponsored( content)?\b/i,
    /\badvertisement\b/i,
    /\baffiliate\b/i,
    /\bbest deals?\b/i,
    /\bdeal of the day\b/i,
    /\bblack friday deals?\b/i,
    /\bcoupons? and deals?\b/i
];

const PROMO_URL = [
    /promo-code/i,
    /coupon-code/i,
    /discount-code/i,
    /\/coupons?\//i,
    /\/deals\//i
];

function normalizeHaystack(value) {
    return String(value || '').toLowerCase();
}

export function publisherFromTitle(title) {
    const text = String(title || '').trim();
    const dash = text.lastIndexOf(' - ');
    if (dash >= 12 && dash < text.length - 3) {
        return {
            title: text.slice(0, dash).trim(),
            source: text.slice(dash + 3).trim()
        };
    }
    return { title: text, source: '' };
}

export function isPromoArticle(article) {
    const title = `${article.title || ''} ${article.description || ''}`;
    const url = article.url || '';
    if (PROMO_TITLE.some(pattern => pattern.test(title))) return true;
    if (PROMO_URL.some(pattern => pattern.test(url))) return true;
    return false;
}

export function qualityNamesFor(code) {
    const local = COUNTRY_QUALITY[String(code || '').toUpperCase()] || [];
    return [...GLOBAL_QUALITY, ...local];
}

export function qualitySearchNames(code) {
    const names = [...(COUNTRY_QUALITY[String(code || '').toUpperCase()] || []), ...GLOBAL_QUALITY]
        .map(name => String(name).trim())
        .filter(name => name.length >= 4);
    return [...new Set(names)].slice(0, 12);
}

export function qualityDomainsFor(code, limit = 6) {
    const local = COUNTRY_DOMAINS[String(code || '').toUpperCase()] || [];
    return [...new Set(local)].slice(0, limit);
}

export function hostnameOf(url) {
    try {
        return new URL(String(url || '')).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
        return '';
    }
}

export function isBlockedHost(url) {
    const host = hostnameOf(url);
    if (!host) return false;
    if (BLOCKED_HOSTS.some(blocked => host === blocked || host.endsWith(`.${blocked}`))) return true;
    return /(^|\.)(coupons?|slickdeals|groupon|retailmenot)(\.|$)/i.test(host);
}

export function isQualityDomain(url, code) {
    const host = hostnameOf(url);
    if (!host) return false;
    const domains = [...qualityDomainsFor(code, 20), ...GLOBAL_QUALITY_DOMAINS];
    return domains.some(domain => host === domain || host.endsWith(`.${domain}`));
}

export function isQualityPublisher(source, code, extraNames = []) {
    const haystack = normalizeHaystack(source);
    if (!haystack) return false;
    const names = [...qualityNamesFor(code), ...extraNames];
    return names.some(name => haystack.includes(normalizeHaystack(name)));
}

export function isQualityArticle(article, code, extraQuality = []) {
    if (isBlockedHost(article?.url)) return false;
    return isQualityPublisher(article?.source, code, extraQuality) || isQualityDomain(article?.url, code);
}

export function isRecentArticle(publishedAt, days = 32) {
    const time = new Date(publishedAt || '').getTime();
    if (Number.isNaN(time)) return false;
    const now = Date.now();
    return time <= now + 36 * 60 * 60 * 1000 && time >= now - days * 24 * 60 * 60 * 1000;
}

export function filterNewsArticles(articles, code, {
    minKeep = 12,
    maxKeep = 800,
    extraQuality = [],
    windowDays = 0
} = {}) {
    const cleaned = articles.filter(article => {
        if (!article?.title || !article?.url) return false;
        if (isPromoArticle(article) || isBlockedHost(article.url)) return false;
        if (windowDays && !isRecentArticle(article.publishedAt, windowDays)) return false;
        return true;
    });
    const ranked = cleaned
        .map(article => ({
            article,
            quality: isQualityArticle(article, code, extraQuality)
        }))
        .sort((a, b) => {
            if (a.quality !== b.quality) return a.quality ? -1 : 1;
            return new Date(b.article.publishedAt) - new Date(a.article.publishedAt);
        });

    const quality = ranked.filter(row => row.quality).map(row => row.article);
    if (quality.length >= minKeep) return quality.slice(0, maxKeep);

    const filler = ranked.filter(row => !row.quality).map(row => row.article);
    const keep = Math.min(maxKeep, Math.max(minKeep, quality.length));
    return [...quality, ...filler].slice(0, keep);
}
