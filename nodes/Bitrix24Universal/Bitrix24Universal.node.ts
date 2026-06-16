import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodeType,
	INodeTypeDescription,
	ResourceMapperFields,
	ResourceMapperValue,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	bitrixApiRequest,
	bitrixApiRequestAllItems,
	extractListItems,
	fetchAvailableMethods,
} from '../Bitrix24/GenericFunctions';
import {
	coerceValueByType,
	fetchMethodParameters,
	getMethodSpec,
} from './MethodSpec';

function parseGenericValue(raw: string): unknown {
	const trimmed = raw.trim();
	if (trimmed === '') return '';

	const lower = trimmed.toLowerCase();
	if (lower === 'true') return true;
	if (lower === 'false') return false;
	if (lower === 'null') return null;

	if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
		const num = Number(trimmed);
		if (!Number.isNaN(num)) return num;
	}

	if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
		try {
			return JSON.parse(trimmed);
		} catch {
			return trimmed;
		}
	}

	return trimmed;
}

/**
 * Собирает тело запроса для режима "Авто" на основе значений resourceMapper и схемы метода.
 */
function buildAutoBody(
	context: IExecuteFunctions,
	itemIndex: number,
	method: string,
): IDataObject {
	const spec = getMethodSpec(method);
	const rm = context.getNodeParameter('parametersUi', itemIndex, {}) as ResourceMapperValue;
	const mapped = (rm?.value as IDataObject) || {};
	const schema = rm?.schema || [];

	const typeById = new Map(schema.map((f) => [f.id, f.type]));
	const coerced: IDataObject = {};
	for (const [key, value] of Object.entries(mapped)) {
		coerced[key] = coerceValueByType(value, typeById.get(key)) as IDataObject[string];
	}

	// Проверка обязательных полей
	const missing = schema
		.filter((f) => f.required)
		.filter((f) => {
			const v = coerced[f.id];
			return v === undefined || v === null || v === '';
		})
		.map((f) => f.displayName);

	if (missing.length > 0) {
		throw new NodeOperationError(
			context.getNode(),
			`Не заполнены обязательные параметры: ${missing.join(', ')}`,
			{ itemIndex },
		);
	}

	if (spec.kind === 'entityFields') {
		const body: IDataObject = {};
		const fields: IDataObject = {};

		for (const [key, value] of Object.entries(coerced)) {
			if (key === 'id' || key === 'params') continue;
			fields[key] = value as IDataObject[string];
		}

		body.fields = fields;
		if (spec.op === 'update') {
			body.id = coerced.id;
		}
		if (coerced.params !== undefined && coerced.params !== '') {
			body.params = coerced.params;
		}
		return body;
	}

	// docParams — плоские параметры метода, пустые необязательные не отправляем
	const requiredIds = new Set(schema.filter((f) => f.required).map((f) => f.id));
	const body: IDataObject = {};
	for (const [key, value] of Object.entries(coerced)) {
		if ((value === '' || value === undefined || value === null) && !requiredIds.has(key)) {
			continue;
		}
		body[key] = value as IDataObject[string];
	}
	return body;
}

function buildManualParameters(context: IExecuteFunctions, itemIndex: number): IDataObject {
	const paramsMode = context.getNodeParameter('paramsMode', itemIndex) as string;

	if (paramsMode === 'json') {
		const raw = context.getNodeParameter('parametersJson', itemIndex, {}) as string | IDataObject;
		if (typeof raw === 'string') {
			const trimmed = raw.trim();
			if (trimmed === '') return {};
			return JSON.parse(trimmed) as IDataObject;
		}
		return raw;
	}

	const collection = context.getNodeParameter('parameters', itemIndex, {}) as {
		parameter?: IDataObject[];
	};

	const params: IDataObject = {};
	for (const entry of collection.parameter || []) {
		const key = entry.name as string;
		const value = entry.value as string;
		if (!key) continue;
		params[key] = parseGenericValue(value) as IDataObject[string];
	}
	return params;
}

export class Bitrix24Universal implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Битрикс24 (Универсальный)',
		name: 'bitrix24Universal',
		icon: 'file:b24u.svg',
		group: ['transform'],
		version: 1,
		subtitle:
			'={{ ($parameter.operation === "batch" ? "Пакет (batch)" : ($parameter.method.value || $parameter.method)) }}',
		description: 'Вызов любого метода REST API Битрикс24 через входящий вебхук',
		defaults: {
			name: 'Битрикс24 (Универсальный)',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'bitrix24WebhookApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Операция',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Вызвать метод',
						value: 'call',
						action: 'Вызвать метод REST API',
						description: 'Один вызов любого метода Битрикс24',
					},
					{
						name: 'Пакетный вызов (batch)',
						value: 'batch',
						action: 'Пакетный вызов методов',
						description: 'До 50 методов в одном запросе через rest.batch',
					},
				],
				default: 'call',
			},

			{
				displayName: 'Метод',
				name: 'method',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				description: 'REST-метод Битрикс24, например crm.deal.list',
				displayOptions: {
					show: {
						operation: ['call'],
					},
				},
				modes: [
					{
						displayName: 'Из списка',
						name: 'list',
						type: 'list',
						typeOptions: {
							searchListMethod: 'searchMethods',
							searchable: true,
						},
					},
					{
						displayName: 'Вручную',
						name: 'id',
						type: 'string',
						placeholder: 'crm.deal.list',
					},
				],
			},
			{
				displayName: 'Способ задания параметров',
				name: 'paramsMode',
				type: 'options',
				options: [
					{
						name: 'Авто (поля метода)',
						value: 'auto',
						description: 'Поля подставляются автоматически по выбранному методу',
					},
					{
						name: 'JSON',
						value: 'json',
						description: 'Полный объект параметров в формате JSON',
					},
					{
						name: 'Поля (ключ → значение)',
						value: 'keyValue',
						description: 'Произвольные пары ключ/значение',
					},
				],
				default: 'auto',
				displayOptions: {
					show: {
						operation: ['call'],
					},
				},
			},
			{
				displayName: 'Параметры метода',
				name: 'parametersUi',
				type: 'resourceMapper',
				default: { mappingMode: 'defineBelow', value: null },
				noDataExpression: true,
				required: true,
				typeOptions: {
					loadOptionsDependsOn: ['method.value', 'operation'],
					resourceMapper: {
						resourceMapperMethod: 'getMethodParameters',
						mode: 'add',
						fieldWords: {
							singular: 'параметр',
							plural: 'параметры',
						},
						addAllFields: true,
						multiKeyMatch: false,
						supportAutoMap: false,
					},
				},
				displayOptions: {
					show: {
						operation: ['call'],
						paramsMode: ['auto'],
					},
				},
			},
			{
				displayName: 'Параметры',
				name: 'parameters',
				type: 'fixedCollection',
				placeholder: 'Добавить параметр',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				description:
					'Значения распознаются автоматически: число, true/false, JSON-массив/объект, иначе строка',
				displayOptions: {
					show: {
						operation: ['call'],
						paramsMode: ['keyValue'],
					},
				},
				options: [
					{
						name: 'parameter',
						displayName: 'Параметр',
						values: [
							{
								displayName: 'Ключ',
								name: 'name',
								type: 'string',
								default: '',
								placeholder: 'id, filter[STAGE_ID], fields[TITLE]',
							},
							{
								displayName: 'Значение',
								name: 'value',
								type: 'string',
								default: '',
							},
						],
					},
				],
			},
			{
				displayName: 'Параметры (JSON)',
				name: 'parametersJson',
				type: 'json',
				default: '{}',
				description: 'Объект параметров метода в формате JSON',
				displayOptions: {
					show: {
						operation: ['call'],
						paramsMode: ['json'],
					},
				},
			},

			{
				displayName: 'Получить все страницы',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				description:
					'Для списочных методов (*.list): автоматически проходить все страницы через next/start',
				displayOptions: {
					show: {
						operation: ['call'],
					},
				},
			},
			{
				displayName: 'Максимум записей',
				name: 'limit',
				type: 'number',
				default: 0,
				typeOptions: {
					minValue: 0,
				},
				description: 'Ограничение количества записей при постраничной выборке (0 — без ограничения)',
				displayOptions: {
					show: {
						operation: ['call'],
						returnAll: [true],
					},
				},
			},
			{
				displayName: 'Разбивать список на элементы',
				name: 'splitIntoItems',
				type: 'boolean',
				default: true,
				description:
					'Если ответ содержит массив записей — вернуть каждую запись отдельным элементом n8n',
				displayOptions: {
					show: {
						operation: ['call'],
					},
				},
			},
			{
				displayName: 'Вернуть полный ответ',
				name: 'returnFullResponse',
				type: 'boolean',
				default: false,
				description:
					'Вернуть весь ответ API (result, time, total, next) вместо только result. Игнорируется при «Получить все страницы»',
				displayOptions: {
					show: {
						operation: ['call'],
						returnAll: [false],
					},
				},
			},

			{
				displayName: 'Команды (cmd)',
				name: 'batchCmd',
				type: 'json',
				default:
					'{\n  "get_user": "user.current",\n  "get_deals": "crm.deal.list?select[]=ID&select[]=TITLE&filter[OPENED]=Y"\n}',
				description:
					'Объект команд для rest.batch. Формат: { "ключ": "метод?параметры" }. В подзапросах можно ссылаться на результаты через $result[ключ]',
				displayOptions: {
					show: {
						operation: ['batch'],
					},
				},
			},
			{
				displayName: 'Прерывать при ошибке (halt)',
				name: 'batchHalt',
				type: 'boolean',
				default: false,
				description: 'Останавливать выполнение пакета при первой ошибке',
				displayOptions: {
					show: {
						operation: ['batch'],
					},
				},
			},
		],
	};

	methods = {
		listSearch: {
			async searchMethods(
				this: ILoadOptionsFunctions,
				filter?: string,
			): Promise<INodeListSearchResult> {
				const methods = await fetchAvailableMethods(this);
				const needle = (filter || '').toLowerCase();

				const results = methods
					.filter((m) => !needle || m.toLowerCase().includes(needle))
					.slice(0, 300)
					.map((m) => ({ name: m, value: m }));

				return { results };
			},
		},

		resourceMapping: {
			async getMethodParameters(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
				const method = this.getNodeParameter('method', '', {
					extractValue: true,
				}) as string;

				if (!method) {
					return {
						fields: [],
						emptyFieldsNotice: 'Сначала выберите метод REST API',
					};
				}

				const fields = await fetchMethodParameters(this, method);

				if (fields.length === 0) {
					return {
						fields: [],
						emptyFieldsNotice:
							'Не удалось загрузить параметры из документации. Переключите на режим JSON.',
					};
				}

				return { fields };
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;

				if (operation === 'batch') {
					const rawCmd = this.getNodeParameter('batchCmd', i, {}) as string | IDataObject;
					const halt = this.getNodeParameter('batchHalt', i, false) as boolean;
					const cmd = typeof rawCmd === 'string' ? JSON.parse(rawCmd || '{}') : rawCmd;

					const response = await bitrixApiRequest.call(this, 'batch', {
						halt: halt ? 1 : 0,
						cmd,
					});

					returnData.push({
						json: (response.result as IDataObject) || response,
						pairedItem: { item: i },
					});
					continue;
				}

				// operation === 'call'
				const method = this.getNodeParameter('method', i, '', {
					extractValue: true,
				}) as string;

				if (!method) {
					throw new NodeOperationError(this.getNode(), 'Не указан метод REST API', {
						itemIndex: i,
					});
				}

				const paramsMode = this.getNodeParameter('paramsMode', i, 'auto') as string;
				const params =
					paramsMode === 'auto'
						? buildAutoBody(this, i, method)
						: buildManualParameters(this, i);

				const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
				const splitIntoItems = this.getNodeParameter('splitIntoItems', i, true) as boolean;

				if (returnAll) {
					const limit = this.getNodeParameter('limit', i, 0) as number;
					const allItems = await bitrixApiRequestAllItems.call(this, method, params, limit);

					if (splitIntoItems) {
						for (const entry of allItems) {
							returnData.push({ json: entry, pairedItem: { item: i } });
						}
					} else {
						returnData.push({
							json: { items: allItems, total: allItems.length },
							pairedItem: { item: i },
						});
					}
					continue;
				}

				const returnFullResponse = this.getNodeParameter(
					'returnFullResponse',
					i,
					false,
				) as boolean;
				const response = await bitrixApiRequest.call(this, method, params);

				if (returnFullResponse) {
					returnData.push({ json: response, pairedItem: { item: i } });
					continue;
				}

				const { items: listItems } = extractListItems(response.result);
				if (listItems.length > 0 && splitIntoItems) {
					for (const entry of listItems) {
						returnData.push({ json: entry, pairedItem: { item: i } });
					}
				} else {
					const result = response.result;
					const json: IDataObject =
						result && typeof result === 'object' && !Array.isArray(result)
							? (result as IDataObject)
							: { result };
					returnData.push({ json, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: error instanceof Error ? error.message : 'Неизвестная ошибка' },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
