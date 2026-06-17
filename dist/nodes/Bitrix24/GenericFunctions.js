"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENTITY_TYPE_IDS = void 0;
exports.normalizeWebhookUrl = normalizeWebhookUrl;
exports.getEntityTypeId = getEntityTypeId;
exports.bitrixApiRequest = bitrixApiRequest;
exports.formatFieldLabel = formatFieldLabel;
exports.parseFieldValue = parseFieldValue;
exports.buildFieldsObject = buildFieldsObject;
exports.fetchBitrixFields = fetchBitrixFields;
exports.fetchAvailableMethods = fetchAvailableMethods;
exports.extractListItems = extractListItems;
exports.bitrixApiRequestAllItems = bitrixApiRequestAllItems;
const n8n_workflow_1 = require("n8n-workflow");
exports.ENTITY_TYPE_IDS = {
    lead: 1,
    deal: 2,
    contact: 3,
};
function normalizeWebhookUrl(url) {
    return url.trim().replace(/\/+$/, '');
}
function getEntityTypeId(resource, smartProcessEntityTypeId) {
    if (resource === 'smartProcess') {
        if (!smartProcessEntityTypeId) {
            throw new n8n_workflow_1.NodeOperationError({ name: 'bitrix24' }, 'Выберите смарт-процесс перед выполнением операции');
        }
        return smartProcessEntityTypeId;
    }
    const entityTypeId = exports.ENTITY_TYPE_IDS[resource];
    if (!entityTypeId) {
        throw new n8n_workflow_1.NodeOperationError({ name: 'bitrix24' }, `Неизвестный тип сущности: ${resource}`);
    }
    return entityTypeId;
}
async function bitrixApiRequest(method, body = {}) {
    const credentials = await this.getCredentials('bitrix24WebhookApi');
    const webhookUrl = normalizeWebhookUrl(credentials.webhookUrl);
    const options = {
        method: 'POST',
        url: `${webhookUrl}/${method}`,
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body,
        json: true,
    };
    try {
        const response = (await this.helpers.httpRequest(options));
        if (response.error) {
            throw new n8n_workflow_1.NodeApiError(this.getNode(), {
                message: `${response.error}: ${response.error_description || 'Неизвестная ошибка'}`,
                description: `Метод Битрикс24: ${method}`,
            });
        }
        return response;
    }
    catch (error) {
        if (error instanceof n8n_workflow_1.NodeApiError)
            throw error;
        const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
        throw new n8n_workflow_1.NodeApiError(this.getNode(), {
            message: `Ошибка API Битрикс24: ${message}`,
            description: `Метод: ${method}`,
        });
    }
}
function formatFieldLabel(field) {
    const id = field.upperName || field.key;
    return `${field.title} (${id})`;
}
function parseFieldValue(rawValue, fieldType) {
    if (rawValue === '' || rawValue === undefined || rawValue === null) {
        return rawValue;
    }
    if (typeof rawValue === 'boolean') {
        if (fieldType === 'boolean')
            return rawValue ? 'Y' : 'N';
        return rawValue;
    }
    if (typeof rawValue === 'number') {
        if (['integer', 'double', 'number'].includes(fieldType))
            return rawValue;
        return String(rawValue);
    }
    if (Array.isArray(rawValue) || (typeof rawValue === 'object' && rawValue !== null)) {
        return rawValue;
    }
    const trimmed = String(rawValue).trim();
    if (fieldType === 'boolean') {
        const lower = trimmed.toLowerCase();
        if (['y', 'yes', 'true', '1', 'да'].includes(lower))
            return 'Y';
        if (['n', 'no', 'false', '0', 'нет'].includes(lower))
            return 'N';
        return trimmed;
    }
    if (['integer', 'double', 'number'].includes(fieldType)) {
        const num = Number(trimmed);
        return Number.isNaN(num) ? trimmed : num;
    }
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
            return JSON.parse(trimmed);
        }
        catch {
            return trimmed;
        }
    }
    return trimmed;
}
function buildFieldsObject(fieldValues, fieldMetaMap) {
    const fields = {};
    for (const entry of fieldValues) {
        const fieldId = entry.fieldId;
        const value = entry.value;
        if (fieldId === undefined || fieldId === '')
            continue;
        if (value === undefined || value === null || value === '')
            continue;
        const meta = fieldMetaMap.get(fieldId);
        fields[fieldId] = (meta ? parseFieldValue(value, meta.type) : value);
    }
    return fields;
}
async function fetchBitrixFields(context, entityTypeId) {
    const response = await bitrixApiRequest.call(context, 'crm.item.fields', {
        entityTypeId,
        useOriginalUfNames: 'Y',
    });
    const rawFields = response.result?.fields;
    if (!rawFields)
        return [];
    return Object.entries(rawFields).map(([key, meta]) => {
        const field = meta;
        return {
            key,
            title: field.title || key,
            upperName: field.upperName || key.toUpperCase(),
            type: field.type || 'string',
            isRequired: Boolean(field.isRequired),
            isReadOnly: Boolean(field.isReadOnly),
        };
    });
}
async function fetchAvailableMethods(context) {
    const response = await bitrixApiRequest.call(context, 'methods', { full: true });
    const result = response.result;
    let methods = [];
    if (Array.isArray(result)) {
        methods = result.map((m) => String(m));
    }
    else if (result && typeof result === 'object') {
        methods = Object.values(result).flatMap((value) => Array.isArray(value) ? value.map((m) => String(m)) : [String(value)]);
    }
    return [...new Set(methods)].filter(Boolean).sort((a, b) => a.localeCompare(b));
}
/**
 * Достаёт массив элементов из ответа списочного метода.
 * Bitrix возвращает либо result=[...], либо result={items:[...]} / {tasks:[...]} и т.п.
 */
function extractListItems(result) {
    if (Array.isArray(result)) {
        return { items: result, wrapperKey: null };
    }
    if (result && typeof result === 'object') {
        const obj = result;
        for (const [key, value] of Object.entries(obj)) {
            if (Array.isArray(value)) {
                return { items: value, wrapperKey: key };
            }
        }
    }
    return { items: [], wrapperKey: null };
}
/**
 * Вызов списочного метода с автоматической постраничной выборкой через next/start.
 */
async function bitrixApiRequestAllItems(method, body = {}, maxItems = 0) {
    const collected = [];
    let start;
    let guard = 0;
    do {
        const requestBody = { ...body };
        if (start !== undefined) {
            requestBody.start = start;
        }
        const response = await bitrixApiRequest.call(this, method, requestBody);
        const { items } = extractListItems(response.result);
        collected.push(...items);
        if (maxItems > 0 && collected.length >= maxItems) {
            return collected.slice(0, maxItems);
        }
        const next = response.next;
        start = typeof next === 'number' ? next : next ? Number(next) : undefined;
        guard += 1;
    } while (start !== undefined && !Number.isNaN(start) && guard < 1000);
    return collected;
}
