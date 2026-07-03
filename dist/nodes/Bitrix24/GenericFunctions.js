"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MULTIFIELD_DEFS = exports.MULTIFIELD_KEY_PREFIX = exports.MULTIFIELD_RAW_KEY = exports.MULTIFIELD_TYPE = exports.ENTITY_TYPE_IDS = void 0;
exports.normalizeWebhookUrl = normalizeWebhookUrl;
exports.getEntityTypeId = getEntityTypeId;
exports.bitrixApiRequest = bitrixApiRequest;
exports.formatFieldLabel = formatFieldLabel;
exports.isMultifieldKey = isMultifieldKey;
exports.buildMultifieldEntries = buildMultifieldEntries;
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
// В универсальном API (crm.item.*) контактные данные (телефон, email, сайт,
// мессенджеры) не являются отдельными полями. Они хранятся в едином множественном
// поле `fm` (тип crm_multifield) в формате [{ typeId, valueType, value }].
// Само поле `fm` для пользователя неинформативно, поэтому в конструкторе мы
// показываем виртуальные поля «Телефон», «E-mail» и т.д., а при отправке
// собираем их обратно в массив `fm`.
exports.MULTIFIELD_TYPE = 'crm_multifield';
exports.MULTIFIELD_RAW_KEY = 'fm';
// Префикс ключа виртуального мультиполя, например: "fm:PHONE".
exports.MULTIFIELD_KEY_PREFIX = 'fm:';
// Виртуальные мультиполя, которые показываем в конструкторе полей.
exports.MULTIFIELD_DEFS = [
    { code: 'PHONE', title: 'Телефон', defaultValueType: 'WORK' },
    { code: 'EMAIL', title: 'E-mail', defaultValueType: 'WORK' },
    { code: 'WEB', title: 'Сайт', defaultValueType: 'WORK' },
    { code: 'IM', title: 'Мессенджер', defaultValueType: 'OTHER' },
];
const MULTIFIELD_DEFS_BY_CODE = new Map(exports.MULTIFIELD_DEFS.map((d) => [d.code, d]));
// Известные типы значений множественных полей. Нужны для распознавания
// необязательного префикса вида "MOBILE:+7999...". Всё остальное считается
// самим значением (важно, чтобы не ломать ссылки http://... в поле «Сайт»).
const MULTIFIELD_VALUE_TYPES = new Set([
    'WORK',
    'MOBILE',
    'HOME',
    'FAX',
    'PAGER',
    'MAILING',
    'OTHER',
    'TELEGRAM',
    'WHATSAPP',
    'VIBER',
    'SKYPE',
    'FACEBOOK',
    'VK',
    'INSTAGRAM',
    'BOTHANDLE',
    'IMOL',
]);
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
function isMultifieldKey(fieldId) {
    return fieldId.startsWith(exports.MULTIFIELD_KEY_PREFIX);
}
/**
 * Разбирает строку виртуального мультиполя в запись { typeId, valueType, value }.
 * Поддерживает необязательный префикс типа значения: "MOBILE:+7999...".
 */
function toMultifieldEntry(raw, def) {
    const trimmed = raw.trim();
    if (trimmed === '')
        return null;
    let valueType = def.defaultValueType;
    let value = trimmed;
    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex > 0) {
        const maybeType = trimmed.slice(0, separatorIndex).trim().toUpperCase();
        if (MULTIFIELD_VALUE_TYPES.has(maybeType)) {
            valueType = maybeType;
            value = trimmed.slice(separatorIndex + 1).trim();
        }
    }
    if (value === '')
        return null;
    return { typeId: def.code, valueType, value };
}
/**
 * Преобразует значение одного виртуального мультиполя (например, «Телефон»)
 * в массив записей формата `fm`: [{ typeId, valueType, value }].
 * Принимает простую строку, несколько строк (разделитель — перевод строки),
 * а также готовый JSON-массив/объект.
 */
function buildMultifieldEntries(code, rawValue) {
    const def = MULTIFIELD_DEFS_BY_CODE.get(code) || {
        code,
        title: code,
        defaultValueType: 'WORK',
    };
    if (rawValue === '' || rawValue === undefined || rawValue === null) {
        return [];
    }
    const normalizeObject = (obj) => {
        const value = (obj.value ?? obj.VALUE ?? obj.val);
        const valueType = (obj.valueType ?? obj.VALUE_TYPE ?? obj.type);
        return {
            typeId: obj.typeId || obj.TYPE_ID || def.code,
            valueType: valueType || def.defaultValueType,
            value: value ?? '',
        };
    };
    if (Array.isArray(rawValue)) {
        return rawValue
            .map((item) => item && typeof item === 'object'
            ? normalizeObject(item)
            : toMultifieldEntry(String(item), def))
            .filter((entry) => entry !== null);
    }
    if (typeof rawValue === 'object') {
        return [normalizeObject(rawValue)];
    }
    const asString = String(rawValue).trim();
    if (asString.startsWith('[') || asString.startsWith('{')) {
        try {
            const parsed = JSON.parse(asString);
            return buildMultifieldEntries(code, parsed);
        }
        catch {
            // не JSON — обрабатываем как обычный текст ниже
        }
    }
    return asString
        .split(/\r?\n/)
        .map((line) => toMultifieldEntry(line, def))
        .filter((entry) => entry !== null);
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
    const multifieldEntries = [];
    for (const entry of fieldValues) {
        const fieldId = entry.fieldId;
        const value = entry.value;
        if (fieldId === undefined || fieldId === '')
            continue;
        if (value === undefined || value === null || value === '')
            continue;
        // Виртуальные мультиполя (fm:PHONE, fm:EMAIL и т.д.) собираем в общий массив fm.
        if (isMultifieldKey(fieldId)) {
            const code = fieldId.slice(exports.MULTIFIELD_KEY_PREFIX.length);
            multifieldEntries.push(...buildMultifieldEntries(code, value));
            continue;
        }
        const meta = fieldMetaMap.get(fieldId);
        fields[fieldId] = (meta ? parseFieldValue(value, meta.type) : value);
    }
    if (multifieldEntries.length > 0) {
        fields[exports.MULTIFIELD_RAW_KEY] = multifieldEntries;
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
            isMultiple: Boolean(field.isMultiple),
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
