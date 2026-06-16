import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	ResourceMapperField,
} from 'n8n-workflow';

import { bitrixApiRequest } from '../Bitrix24/GenericFunctions';
import { fetchMethodParamsFromDocs } from './MethodDocLoader';

export type MethodSpec =
	| { kind: 'entityFields'; entity: string; op: 'add' | 'update' }
	| { kind: 'docParams' }
	| { kind: 'none' };

const BOOL_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Да (Y)', value: 'Y' },
	{ name: 'Нет (N)', value: 'N' },
];

function shortLegacyDescription(meta: IDataObject): string {
	const parts: string[] = [];
	if (meta.isMultiple) parts.push('множественное');
	if (meta.isDynamic) parts.push('динамическое');
	return parts.join(', ');
}

function field(
	id: string,
	displayName: string,
	required: boolean,
	type: ResourceMapperField['type'] = 'string',
	extra: Partial<ResourceMapperField> = {},
): ResourceMapperField {
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
export function getMethodSpec(method: string): MethodSpec {
	const m = method.trim().toLowerCase();
	if (!m) return { kind: 'none' };

	// Легаси CRM: поля подтягиваются вживую с портала (русские названия + UF)
	const legacyMatch = m.match(/^crm\.(lead|deal|contact|company)\.(add|update)$/);
	if (legacyMatch) {
		return { kind: 'entityFields', entity: legacyMatch[1], op: legacyMatch[2] as 'add' | 'update' };
	}

	return { kind: 'docParams' };
}

function mapLegacyFieldType(meta: IDataObject): {
	type: ResourceMapperField['type'];
	options?: INodePropertyOptions[];
} {
	if (meta.isMultiple) return { type: 'array' };

	const type = String(meta.type || 'string').toLowerCase();
	if (type === 'boolean' || type === 'char') {
		return { type: 'options', options: BOOL_OPTIONS };
	}
	if (type === 'integer' || type === 'double') {
		return { type: 'number' };
	}
	return { type: 'string' };
}

export async function fetchLegacyEntityFields(
	context: ILoadOptionsFunctions | IExecuteFunctions,
	entity: string,
	op: 'add' | 'update',
): Promise<ResourceMapperField[]> {
	const response = await bitrixApiRequest.call(context, `crm.${entity}.fields`, {});
	const rawFields = (response.result as IDataObject) || {};

	const mapped: ResourceMapperField[] = [];

	if (op === 'update') {
		mapped.push(field('id', 'ID записи (id)', true, 'number'));
	}

	for (const [key, value] of Object.entries(rawFields)) {
		const meta = value as IDataObject;
		if (key === 'ID') continue;
		if (meta.isReadOnly) continue;

		const required = Boolean(meta.isRequired);
		const { type, options } = mapLegacyFieldType(meta);
		const title = (meta.title as string) || key;

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

export async function fetchMethodParameters(
	context: ILoadOptionsFunctions | IExecuteFunctions,
	method: string,
): Promise<ResourceMapperField[]> {
	const spec = getMethodSpec(method);

	if (spec.kind === 'entityFields') {
		return fetchLegacyEntityFields(context, spec.entity, spec.op);
	}

	if (spec.kind === 'docParams') {
		return fetchMethodParamsFromDocs(context, method);
	}

	return [];
}

export function coerceValueByType(value: unknown, type: ResourceMapperField['type']): unknown {
	if (value === undefined || value === null || value === '') return value;

	if ((type === 'object' || type === 'array') && typeof value === 'string') {
		try {
			return JSON.parse(value);
		} catch {
			return value;
		}
	}

	if (type === 'number' && typeof value === 'string') {
		const num = Number(value);
		return Number.isNaN(num) ? value : num;
	}

	return value;
}
