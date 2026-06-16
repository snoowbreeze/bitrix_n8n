"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMethodSpec = getMethodSpec;
exports.fetchLegacyEntityFields = fetchLegacyEntityFields;
exports.fetchMethodParameters = fetchMethodParameters;
exports.coerceValueByType = coerceValueByType;
const GenericFunctions_1 = require("../Bitrix24/GenericFunctions");
const MethodDocLoader_1 = require("./MethodDocLoader");
const BOOL_OPTIONS = [
    { name: 'Да (Y)', value: 'Y' },
    { name: 'Нет (N)', value: 'N' },
];
function shortLegacyDescription(meta) {
    const parts = [];
    if (meta.isMultiple)
        parts.push('множественное');
    if (meta.isDynamic)
        parts.push('динамическое');
    return parts.join(', ');
}
function field(id, displayName, required, type = 'string', extra = {}) {
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
/**
 * Определяет стратегию загрузки параметров для метода.
 * По умолчанию — из официальной документации через MCP Bitrix24.
 */
function getMethodSpec(method) {
    const m = method.trim().toLowerCase();
    if (!m)
        return { kind: 'none' };
    // Легаси CRM: поля подтягиваются вживую с портала (русские названия + UF)
    const legacyMatch = m.match(/^crm\.(lead|deal|contact|company)\.(add|update)$/);
    if (legacyMatch) {
        return { kind: 'entityFields', entity: legacyMatch[1], op: legacyMatch[2] };
    }
    return { kind: 'docParams' };
}
function mapLegacyFieldType(meta) {
    if (meta.isMultiple)
        return { type: 'array' };
    const type = String(meta.type || 'string').toLowerCase();
    if (type === 'boolean' || type === 'char') {
        return { type: 'options', options: BOOL_OPTIONS };
    }
    if (type === 'integer' || type === 'double') {
        return { type: 'number' };
    }
    return { type: 'string' };
}
async function fetchLegacyEntityFields(context, entity, op) {
    const response = await GenericFunctions_1.bitrixApiRequest.call(context, `crm.${entity}.fields`, {});
    const rawFields = response.result || {};
    const mapped = [];
    if (op === 'update') {
        mapped.push(field('id', 'ID записи (id)', true, 'number'));
    }
    for (const [key, value] of Object.entries(rawFields)) {
        const meta = value;
        if (key === 'ID')
            continue;
        if (meta.isReadOnly)
            continue;
        const required = Boolean(meta.isRequired);
        const { type, options } = mapLegacyFieldType(meta);
        const title = meta.title || key;
        const typeHint = String(meta.type || 'string');
        const desc = shortLegacyDescription(meta);
        const displayName = desc
            ? `${key}${required ? ' *' : ''} (${typeHint}) — ${desc}`
            : `${title} (${key})`;
        mapped.push(field(key, displayName, required, type, options ? { options } : {}));
    }
    mapped.push(field('params', 'Доп. параметры (params)', false, 'object', { defaultValue: '{}' }));
    return mapped;
}
async function fetchMethodParameters(context, method) {
    const spec = getMethodSpec(method);
    if (spec.kind === 'entityFields') {
        return fetchLegacyEntityFields(context, spec.entity, spec.op);
    }
    if (spec.kind === 'docParams') {
        return (0, MethodDocLoader_1.fetchMethodParamsFromDocs)(context, method);
    }
    return [];
}
function coerceValueByType(value, type) {
    if (value === undefined || value === null || value === '')
        return value;
    if ((type === 'object' || type === 'array') && typeof value === 'string') {
        try {
            return JSON.parse(value);
        }
        catch {
            return value;
        }
    }
    if (type === 'number' && typeof value === 'string') {
        const num = Number(value);
        return Number.isNaN(num) ? value : num;
    }
    return value;
}
