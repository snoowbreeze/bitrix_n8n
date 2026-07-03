import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INode,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

export const ENTITY_TYPE_IDS: Record<string, number> = {
	lead: 1,
	deal: 2,
	contact: 3,
};

export interface BitrixFieldMeta {
	key: string;
	title: string;
	upperName: string;
	type: string;
	isRequired: boolean;
	isReadOnly: boolean;
	isMultiple: boolean;
}

// В универсальном API (crm.item.*) контактные данные (телефон, email, сайт,
// мессенджеры) не являются отдельными полями. Они хранятся в едином множественном
// поле `fm` (тип crm_multifield) в формате [{ typeId, valueType, value }].
// Само поле `fm` для пользователя неинформативно, поэтому в конструкторе мы
// показываем виртуальные поля «Телефон», «E-mail» и т.д., а при отправке
// собираем их обратно в массив `fm`.
export const MULTIFIELD_TYPE = 'crm_multifield';
export const MULTIFIELD_RAW_KEY = 'fm';

// Префикс ключа виртуального мультиполя, например: "fm:PHONE".
export const MULTIFIELD_KEY_PREFIX = 'fm:';

export interface MultifieldDef {
	code: string;
	title: string;
	defaultValueType: string;
}

// Виртуальные мультиполя, которые показываем в конструкторе полей.
export const MULTIFIELD_DEFS: MultifieldDef[] = [
	{ code: 'PHONE', title: 'Телефон', defaultValueType: 'WORK' },
	{ code: 'EMAIL', title: 'E-mail', defaultValueType: 'WORK' },
	{ code: 'WEB', title: 'Сайт', defaultValueType: 'WORK' },
	{ code: 'IM', title: 'Мессенджер', defaultValueType: 'OTHER' },
];

const MULTIFIELD_DEFS_BY_CODE = new Map(MULTIFIELD_DEFS.map((d) => [d.code, d]));

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

export function normalizeWebhookUrl(url: string): string {
	return url.trim().replace(/\/+$/, '');
}

export function getEntityTypeId(
	resource: string,
	smartProcessEntityTypeId?: number,
): number {
	if (resource === 'smartProcess') {
		if (!smartProcessEntityTypeId) {
			throw new NodeOperationError(
				{ name: 'bitrix24' } as INode,
				'Выберите смарт-процесс перед выполнением операции',
			);
		}
		return smartProcessEntityTypeId;
	}

	const entityTypeId = ENTITY_TYPE_IDS[resource];
	if (!entityTypeId) {
		throw new NodeOperationError(
			{ name: 'bitrix24' } as INode,
			`Неизвестный тип сущности: ${resource}`,
		);
	}
	return entityTypeId;
}

export async function bitrixApiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: string,
	body: IDataObject = {},
): Promise<IDataObject> {
	const credentials = await this.getCredentials('bitrix24WebhookApi');
	const webhookUrl = normalizeWebhookUrl(credentials.webhookUrl as string);

	const options: IHttpRequestOptions = {
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
		const response = (await this.helpers.httpRequest(options)) as JsonObject;

		if (response.error) {
			throw new NodeApiError(this.getNode(), {
				message: `${response.error as string}: ${(response.error_description as string) || 'Неизвестная ошибка'}`,
				description: `Метод Битрикс24: ${method}`,
			});
		}

		return response;
	} catch (error) {
		if (error instanceof NodeApiError) throw error;

		const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
		throw new NodeApiError(this.getNode(), {
			message: `Ошибка API Битрикс24: ${message}`,
			description: `Метод: ${method}`,
		});
	}
}

export function formatFieldLabel(field: BitrixFieldMeta): string {
	const id = field.upperName || field.key;
	return `${field.title} (${id})`;
}

export function isMultifieldKey(fieldId: string): boolean {
	return fieldId.startsWith(MULTIFIELD_KEY_PREFIX);
}

/**
 * Разбирает строку виртуального мультиполя в запись { typeId, valueType, value }.
 * Поддерживает необязательный префикс типа значения: "MOBILE:+7999...".
 */
function toMultifieldEntry(raw: string, def: MultifieldDef): IDataObject | null {
	const trimmed = raw.trim();
	if (trimmed === '') return null;

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

	if (value === '') return null;
	return { typeId: def.code, valueType, value };
}

/**
 * Преобразует значение одного виртуального мультиполя (например, «Телефон»)
 * в массив записей формата `fm`: [{ typeId, valueType, value }].
 * Принимает простую строку, несколько строк (разделитель — перевод строки),
 * а также готовый JSON-массив/объект.
 */
export function buildMultifieldEntries(code: string, rawValue: unknown): IDataObject[] {
	const def = MULTIFIELD_DEFS_BY_CODE.get(code) || {
		code,
		title: code,
		defaultValueType: 'WORK',
	};

	if (rawValue === '' || rawValue === undefined || rawValue === null) {
		return [];
	}

	const normalizeObject = (obj: IDataObject): IDataObject => {
		const value = (obj.value ?? obj.VALUE ?? obj.val) as unknown;
		const valueType = (obj.valueType ?? obj.VALUE_TYPE ?? obj.type) as unknown;
		return {
			typeId: (obj.typeId as string) || (obj.TYPE_ID as string) || def.code,
			valueType: (valueType as string) || def.defaultValueType,
			value: value ?? '',
		};
	};

	if (Array.isArray(rawValue)) {
		return rawValue
			.map((item) =>
				item && typeof item === 'object'
					? normalizeObject(item as IDataObject)
					: toMultifieldEntry(String(item), def),
			)
			.filter((entry): entry is IDataObject => entry !== null);
	}

	if (typeof rawValue === 'object') {
		return [normalizeObject(rawValue as IDataObject)];
	}

	const asString = String(rawValue).trim();

	if (asString.startsWith('[') || asString.startsWith('{')) {
		try {
			const parsed = JSON.parse(asString);
			return buildMultifieldEntries(code, parsed);
		} catch {
			// не JSON — обрабатываем как обычный текст ниже
		}
	}

	return asString
		.split(/\r?\n/)
		.map((line) => toMultifieldEntry(line, def))
		.filter((entry): entry is IDataObject => entry !== null);
}

export function parseFieldValue(rawValue: unknown, fieldType: string): unknown {
	if (rawValue === '' || rawValue === undefined || rawValue === null) {
		return rawValue;
	}

	if (typeof rawValue === 'boolean') {
		if (fieldType === 'boolean') return rawValue ? 'Y' : 'N';
		return rawValue;
	}

	if (typeof rawValue === 'number') {
		if (['integer', 'double', 'number'].includes(fieldType)) return rawValue;
		return String(rawValue);
	}

	if (Array.isArray(rawValue) || (typeof rawValue === 'object' && rawValue !== null)) {
		return rawValue;
	}

	const trimmed = String(rawValue).trim();

	if (fieldType === 'boolean') {
		const lower = trimmed.toLowerCase();
		if (['y', 'yes', 'true', '1', 'да'].includes(lower)) return 'Y';
		if (['n', 'no', 'false', '0', 'нет'].includes(lower)) return 'N';
		return trimmed;
	}

	if (['integer', 'double', 'number'].includes(fieldType)) {
		const num = Number(trimmed);
		return Number.isNaN(num) ? trimmed : num;
	}

	if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
		try {
			return JSON.parse(trimmed);
		} catch {
			return trimmed;
		}
	}

	return trimmed;
}

export function buildFieldsObject(
	fieldValues: IDataObject[],
	fieldMetaMap: Map<string, BitrixFieldMeta>,
): IDataObject {
	const fields: IDataObject = {};
	const multifieldEntries: IDataObject[] = [];

	for (const entry of fieldValues) {
		const fieldId = entry.fieldId as string;
		const value = entry.value as unknown;

		if (fieldId === undefined || fieldId === '') continue;
		if (value === undefined || value === null || value === '') continue;

		// Виртуальные мультиполя (fm:PHONE, fm:EMAIL и т.д.) собираем в общий массив fm.
		if (isMultifieldKey(fieldId)) {
			const code = fieldId.slice(MULTIFIELD_KEY_PREFIX.length);
			multifieldEntries.push(...buildMultifieldEntries(code, value));
			continue;
		}

		const meta = fieldMetaMap.get(fieldId);
		fields[fieldId] = (meta ? parseFieldValue(value, meta.type) : value) as IDataObject[string];
	}

	if (multifieldEntries.length > 0) {
		fields[MULTIFIELD_RAW_KEY] = multifieldEntries as IDataObject[string];
	}

	return fields;
}

export async function fetchBitrixFields(
	context: ILoadOptionsFunctions | IExecuteFunctions,
	entityTypeId: number,
): Promise<BitrixFieldMeta[]> {
	const response = await bitrixApiRequest.call(context, 'crm.item.fields', {
		entityTypeId,
		useOriginalUfNames: 'Y',
	});

	const rawFields = (response.result as IDataObject)?.fields as IDataObject;
	if (!rawFields) return [];

	return Object.entries(rawFields).map(([key, meta]) => {
		const field = meta as IDataObject;
		return {
			key,
			title: (field.title as string) || key,
			upperName: (field.upperName as string) || key.toUpperCase(),
			type: (field.type as string) || 'string',
			isRequired: Boolean(field.isRequired),
			isReadOnly: Boolean(field.isReadOnly),
			isMultiple: Boolean(field.isMultiple),
		};
	});
}

export async function fetchAvailableMethods(
	context: ILoadOptionsFunctions | IExecuteFunctions,
): Promise<string[]> {
	const response = await bitrixApiRequest.call(context, 'methods', { full: true });
	const result = response.result;

	let methods: string[] = [];
	if (Array.isArray(result)) {
		methods = result.map((m) => String(m));
	} else if (result && typeof result === 'object') {
		methods = Object.values(result as IDataObject).flatMap((value) =>
			Array.isArray(value) ? value.map((m) => String(m)) : [String(value)],
		);
	}

	return [...new Set(methods)].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

/**
 * Достаёт массив элементов из ответа списочного метода.
 * Bitrix возвращает либо result=[...], либо result={items:[...]} / {tasks:[...]} и т.п.
 */
export function extractListItems(result: unknown): {
	items: IDataObject[];
	wrapperKey: string | null;
} {
	if (Array.isArray(result)) {
		return { items: result as IDataObject[], wrapperKey: null };
	}

	if (result && typeof result === 'object') {
		const obj = result as IDataObject;
		for (const [key, value] of Object.entries(obj)) {
			if (Array.isArray(value)) {
				return { items: value as IDataObject[], wrapperKey: key };
			}
		}
	}

	return { items: [], wrapperKey: null };
}

/**
 * Вызов списочного метода с автоматической постраничной выборкой через next/start.
 */
export async function bitrixApiRequestAllItems(
	this: IExecuteFunctions,
	method: string,
	body: IDataObject = {},
	maxItems = 0,
): Promise<IDataObject[]> {
	const collected: IDataObject[] = [];
	let start: number | undefined;
	let guard = 0;

	do {
		const requestBody: IDataObject = { ...body };
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
