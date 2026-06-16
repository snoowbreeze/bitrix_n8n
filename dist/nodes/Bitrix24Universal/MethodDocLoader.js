"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseParamsFromApidocsHtml = parseParamsFromApidocsHtml;
exports.parseMethodParamsText = parseMethodParamsText;
exports.fetchMethodParamsFromDocs = fetchMethodParamsFromDocs;
const apidocs_method_urls_json_1 = __importDefault(require("./apidocs-method-urls.json"));
const MCP_URL = 'https://mcp-dev.bitrix24.com/mcp';
const APIDOCS_BASE = 'https://apidocs.bitrix24.ru';
const methodUrlIndex = apidocs_method_urls_json_1.default;
const paramsCache = new Map();
const BOOL_OPTIONS = [
    { name: 'Да (Y)', value: 'Y' },
    { name: 'Нет (N)', value: 'N' },
];
const TYPE_LABELS = {
    integer: 'целое',
    double: 'число',
    number: 'число',
    string: 'строка',
    boolean: 'логическое',
    object: 'объект',
    array: 'массив',
};
function mapperField(id, displayName, required, type = 'string', extra = {}) {
    return {
        id,
        displayName,
        required,
        defaultMatch: false,
        display: true,
        type,
        removed: false,
        ...extra,
    };
}
function typeLabel(typeStr) {
    const parts = typeStr.split('|').map((t) => t.trim().toLowerCase());
    const primary = parts[0] || 'string';
    return TYPE_LABELS[primary] || primary;
}
function mapParamType(typeStr, description) {
    const types = typeStr.split('|').map((t) => t.trim().toLowerCase());
    const descLower = description.toLowerCase();
    if (types.includes('integer') || types.includes('double') || types.includes('number')) {
        return { type: 'number' };
    }
    if (types.includes('boolean')) {
        return { type: 'options', options: BOOL_OPTIONS, defaultValue: 'N' };
    }
    if (types.includes('array') || types.some((t) => t.endsWith('[]'))) {
        return { type: 'array', defaultValue: '[]' };
    }
    if (types.includes('object')) {
        return { type: 'object', defaultValue: '{}' };
    }
    // Y/N флаги в строковых параметрах
    if (types.includes('string') &&
        (descLower.includes('y —') ||
            descLower.includes('y -') ||
            descLower.includes('allowed values: y') ||
            descLower.includes('допустимые значения: y'))) {
        return { type: 'options', options: BOOL_OPTIONS, defaultValue: 'N' };
    }
    return { type: 'string' };
}
function shortDescription(text, maxLen = 110) {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned)
        return '';
    const firstSentence = cleaned.split(/\.(?:\s|$)/)[0]?.trim() || cleaned;
    if (firstSentence.length <= maxLen)
        return firstSentence;
    return `${firstSentence.slice(0, maxLen - 3).trim()}...`;
}
function buildDisplayName(id, typeStr, description, required) {
    const desc = shortDescription(description);
    const typePart = typeLabel(typeStr);
    const requiredMark = required ? ' *' : '';
    if (desc)
        return `${id}${requiredMark} (${typePart}) — ${desc}`;
    return `${id}${requiredMark} (${typePart})`;
}
function methodToSlug(method) {
    return method.trim().toLowerCase().replace(/\./g, '-');
}
function buildApidocsCandidates(method) {
    const m = method.trim().toLowerCase();
    const parts = m.split('.');
    const slug = methodToSlug(m);
    const [scope, entity] = parts;
    const candidates = [];
    if (scope) {
        candidates.push(`${APIDOCS_BASE}/api-reference/${scope}/${slug}.html`);
    }
    if (scope && entity) {
        candidates.push(`${APIDOCS_BASE}/api-reference/${scope}/${entity}/${slug}.html`);
        candidates.push(`${APIDOCS_BASE}/api-reference/${scope}/${entity}s/${slug}.html`);
    }
    if (scope === 'imbot' && entity) {
        candidates.push(`${APIDOCS_BASE}/api-reference/chat-bots/outdated/${entity}s/${slug}.html`);
        candidates.push(`${APIDOCS_BASE}/api-reference/chat-bots/outdated/${entity}/${slug}.html`);
    }
    if (scope === 'crm' && entity) {
        candidates.push(`${APIDOCS_BASE}/api-reference/crm/${entity}s/${slug}.html`);
    }
    if (scope === 'im' && entity) {
        candidates.push(`${APIDOCS_BASE}/api-reference/chats/messages/${slug}.html`);
        candidates.push(`${APIDOCS_BASE}/api-reference/chats/${slug}.html`);
    }
    if (scope === 'task' && entity) {
        candidates.push(`${APIDOCS_BASE}/api-reference/tasks/deprecated/task-${entity}/${slug}.html`);
        candidates.push(`${APIDOCS_BASE}/api-reference/tasks/${slug}.html`);
    }
    if (scope === 'user') {
        candidates.push(`${APIDOCS_BASE}/api-reference/user/${slug}.html`);
    }
    const indexedPath = methodUrlIndex[m];
    if (indexedPath) {
        candidates.unshift(`${APIDOCS_BASE}/${indexedPath}`);
    }
    return [...new Set(candidates)];
}
function findParamsTableStart(html) {
    const examplesIdx = html.search(/Примеры кода<\/h2>|Code Examples<\/h2>/i);
    const searchArea = examplesIdx !== -1 ? html.slice(0, examplesIdx) : html;
    let cursor = 0;
    while (cursor < searchArea.length) {
        const tableHeader = searchArea.indexOf('<strong>Название</strong>', cursor);
        if (tableHeader === -1)
            return -1;
        const hasTypeHeader = searchArea.includes('>тип</code>', tableHeader) ||
            searchArea.includes('>Type</code>', tableHeader) ||
            searchArea.includes('data-types.html', tableHeader);
        if (hasTypeHeader) {
            const tableStart = searchArea.lastIndexOf('<table', tableHeader);
            return tableStart !== -1 ? tableStart : tableHeader;
        }
        cursor = tableHeader + 1;
    }
    return -1;
}
function extractParamsSection(html) {
    const startMarkers = [
        'Обязательные параметры отмечены',
        'Required parameters are marked',
        'Параметры метода</h2>',
        'Method Parameters</h2>',
    ];
    const endMarkers = ['Примеры кода</h2>', 'Code Examples</h2>'];
    let start = -1;
    for (const marker of startMarkers) {
        const idx = html.indexOf(marker);
        if (idx !== -1) {
            start = idx;
            break;
        }
    }
    if (start === -1) {
        start = findParamsTableStart(html);
    }
    if (start === -1)
        return '';
    let end = html.length;
    for (const marker of endMarkers) {
        const idx = html.indexOf(marker, start + 100);
        if (idx !== -1 && idx < end)
            end = idx;
    }
    return html.slice(start, end);
}
function parseParamsFromApidocsHtml(html) {
    const fields = [];
    const section = extractParamsSection(html);
    const paramPattern = /<strong>([A-Za-z_][A-Za-z0-9_]*)<\/strong>(\*?)<br\s*\/?>\s*(?:<a[^>]*>)?<code[^>]*>([^<]+)<\/code>/g;
    const skipIds = new Set(['Название', 'Описание', 'Name', 'Description', 'Type', 'Тип']);
    for (const match of section.matchAll(paramPattern)) {
        const [, id, requiredMark, rawType] = match;
        if (skipIds.has(id))
            continue;
        const required = requiredMark === '*';
        const matchIndex = match.index ?? 0;
        const chunk = section.slice(matchIndex, matchIndex + 2500);
        const descMatch = chunk.match(/<td>\s*<p>([\s\S]*?)<\/p>/);
        let description = '';
        if (descMatch) {
            description = descMatch[1]
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }
        const typeStr = rawType.trim();
        const { type, options, defaultValue } = mapParamType(typeStr, description);
        fields.push(mapperField(id, buildDisplayName(id, typeStr, description, required), required, type, {
            ...(options ? { options } : {}),
            ...(defaultValue !== undefined ? { defaultValue } : {}),
        }));
    }
    return fields;
}
async function fetchParamsFromApidocs(context, method) {
    const candidates = buildApidocsCandidates(method);
    for (const url of candidates) {
        try {
            const response = await context.helpers.httpRequest({
                method: 'GET',
                url,
                json: false,
                returnFullResponse: true,
            });
            const body = typeof response === 'string'
                ? response
                : typeof response.body === 'string'
                    ? response.body
                    : String(response.data ?? '');
            if (!body.includes(method) && !body.includes(methodToSlug(method))) {
                continue;
            }
            const fields = parseParamsFromApidocsHtml(body);
            if (fields.length > 0) {
                return fields;
            }
        }
        catch {
            // try next candidate
        }
    }
    return [];
}
/**
 * Парсит текст параметров из bitrix-method-details (field=params).
 */
function parseMethodParamsText(text) {
    const fields = [];
    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line)
            continue;
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*\(([^)]+)\)\s*(.*?)\s*\[required:\s*(yes|no|да|нет)\]\s*$/i);
        if (!match)
            continue;
        const [, id, typeStr, description, requiredStr] = match;
        const required = ['yes', 'да'].includes(requiredStr.toLowerCase());
        const { type, options, defaultValue } = mapParamType(typeStr, description);
        fields.push(mapperField(id, buildDisplayName(id, typeStr, description, required), required, type, {
            ...(options ? { options } : {}),
            ...(defaultValue !== undefined ? { defaultValue } : {}),
        }));
    }
    return fields;
}
function extractTextFromMcpSse(body) {
    for (const line of body.split('\n')) {
        if (!line.startsWith('data: '))
            continue;
        try {
            const payload = JSON.parse(line.slice(6));
            const structured = payload.result?.structuredContent;
            if (typeof structured?.result === 'string') {
                return structured.result;
            }
            const content = payload.result?.content;
            if (Array.isArray(content) && typeof content[0]?.text === 'string') {
                return content[0].text;
            }
        }
        catch {
            // skip invalid json lines
        }
    }
    return '';
}
async function fetchParamsFromMcp(context, method) {
    const cacheKey = method.trim().toLowerCase();
    const response = await context.helpers.httpRequest({
        method: 'POST',
        url: MCP_URL,
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
        },
        body: {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
                name: 'bitrix-method-details',
                arguments: {
                    method: cacheKey,
                    field: 'params',
                },
            },
        },
        json: false,
        returnFullResponse: true,
    });
    const body = typeof response === 'string'
        ? response
        : typeof response.body === 'string'
            ? response.body
            : String(response.data ?? response);
    const paramsText = extractTextFromMcpSse(body);
    if (!paramsText || paramsText.toLowerCase().includes('not found'))
        return [];
    return parseMethodParamsText(paramsText);
}
async function fetchMethodParamsFromDocs(context, method) {
    const cacheKey = method.trim().toLowerCase();
    if (paramsCache.has(cacheKey)) {
        return paramsCache.get(cacheKey);
    }
    try {
        // Сначала русские описания из apidocs.bitrix24.ru
        const fromApidocs = await fetchParamsFromApidocs(context, method);
        if (fromApidocs.length > 0) {
            paramsCache.set(cacheKey, fromApidocs);
            return fromApidocs;
        }
        // Запасной вариант — MCP (английские описания)
        const fromMcp = await fetchParamsFromMcp(context, method);
        paramsCache.set(cacheKey, fromMcp);
        return fromMcp;
    }
    catch {
        return [];
    }
}
