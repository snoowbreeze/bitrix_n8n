"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bitrix24 = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const GenericFunctions_1 = require("./GenericFunctions");
async function resolveFields(context, itemIndex, entityTypeId) {
    const inputMode = context.getNodeParameter('inputMode', itemIndex);
    if (inputMode === 'json') {
        const fieldsJson = context.getNodeParameter('fieldsJson', itemIndex);
        if (typeof fieldsJson === 'string') {
            return JSON.parse(fieldsJson);
        }
        return fieldsJson;
    }
    const fieldValuesCollection = context.getNodeParameter('fieldValues', itemIndex, {});
    const fieldValues = fieldValuesCollection.field || [];
    if (fieldValues.length === 0) {
        return {};
    }
    const allFields = await (0, GenericFunctions_1.fetchBitrixFields)(context, entityTypeId);
    const fieldMetaMap = new Map(allFields.map((f) => [f.key, f]));
    return (0, GenericFunctions_1.buildFieldsObject)(fieldValues, fieldMetaMap);
}
class Bitrix24 {
    constructor() {
        this.description = {
            displayName: 'Битрикс24',
            name: 'bitrix24',
            icon: 'file:b24.svg',
            group: ['transform'],
            version: 1,
            subtitle: '={{ ({create:"Создать",update:"Изменить",delete:"Удалить",get:"Получить"}[$parameter.operation] || $parameter.operation) + ": " + ({lead:"Лид",deal:"Сделка",contact:"Контакт",smartProcess:"Смарт-процесс"}[$parameter.resource] || $parameter.resource) }}',
            description: 'Работа с CRM Битрикс24 через входящий вебхук (лиды, сделки, контакты, смарт-процессы)',
            defaults: {
                name: 'Битрикс24',
            },
            inputs: [n8n_workflow_1.NodeConnectionTypes.Main],
            outputs: [n8n_workflow_1.NodeConnectionTypes.Main],
            credentials: [
                {
                    name: 'bitrix24WebhookApi',
                    required: true,
                },
            ],
            properties: [
                {
                    displayName: 'Ресурс',
                    name: 'resource',
                    type: 'options',
                    noDataExpression: true,
                    options: [
                        { name: 'Лид', value: 'lead' },
                        { name: 'Сделка', value: 'deal' },
                        { name: 'Контакт', value: 'contact' },
                        { name: 'Смарт-процесс', value: 'smartProcess' },
                    ],
                    default: 'deal',
                },
                {
                    displayName: 'Смарт-процесс',
                    name: 'smartProcessEntityTypeId',
                    type: 'options',
                    description: 'Выберите смарт-процесс. В скобках указан entityTypeId для API',
                    typeOptions: {
                        loadOptionsMethod: 'getSmartProcesses',
                    },
                    default: '',
                    displayOptions: {
                        show: {
                            resource: ['smartProcess'],
                        },
                    },
                },
                {
                    displayName: 'Операция',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    options: [
                        { name: 'Создать', value: 'create', action: 'Создать запись в CRM', description: 'Создать новую запись' },
                        { name: 'Изменить', value: 'update', action: 'Изменить запись в CRM', description: 'Обновить существующую запись' },
                        { name: 'Удалить', value: 'delete', action: 'Удалить запись в CRM', description: 'Удалить запись по ID' },
                        { name: 'Получить', value: 'get', action: 'Получить запись из CRM', description: 'Получить запись по ID' },
                    ],
                    default: 'create',
                },
                {
                    displayName: 'ID записи',
                    name: 'recordId',
                    type: 'string',
                    default: '',
                    required: true,
                    description: 'Идентификатор записи в Битрикс24',
                    displayOptions: {
                        show: {
                            operation: ['update', 'delete', 'get'],
                        },
                    },
                },
                {
                    displayName: 'Режим ввода',
                    name: 'inputMode',
                    type: 'options',
                    options: [
                        {
                            name: 'Конструктор полей',
                            value: 'fields',
                            description: 'Удобный выбор полей с названиями из Битрикс24',
                        },
                        {
                            name: 'JSON',
                            value: 'json',
                            description: 'Прямой ввод JSON-объекта полей',
                        },
                    ],
                    default: 'fields',
                    displayOptions: {
                        show: {
                            operation: ['create', 'update'],
                        },
                    },
                },
                {
                    displayName: 'Поля',
                    name: 'fieldValues',
                    placeholder: 'Добавить поле',
                    type: 'fixedCollection',
                    typeOptions: {
                        multipleValues: true,
                        sortable: true,
                    },
                    description: 'Поля загружаются из вашего Битрикс24. Формат: Название (ID)',
                    default: {},
                    displayOptions: {
                        show: {
                            operation: ['create', 'update'],
                            inputMode: ['fields'],
                        },
                    },
                    options: [
                        {
                            name: 'field',
                            displayName: 'Поле',
                            values: [
                                {
                                    displayName: 'Название или ID поля',
                                    name: 'fieldId',
                                    type: 'options',
                                    typeOptions: {
                                        loadOptionsMethod: 'getFields',
                                        loadOptionsDependsOn: ['resource', 'smartProcessEntityTypeId', 'operation'],
                                    },
                                    default: '',
                                    description: 'Название поля и его ID в скобках, например: Название (TITLE)',
                                },
                                {
                                    displayName: 'Значение',
                                    name: 'value',
                                    type: 'string',
                                    default: '',
                                    description: 'Значение поля. Для массивов и объектов — JSON. Для логических: Y/N, true/false, да/нет',
                                },
                            ],
                        },
                    ],
                },
                {
                    displayName: 'Поля (JSON)',
                    name: 'fieldsJson',
                    type: 'json',
                    default: '{\n  "title": "Новая запись"\n}',
                    description: 'JSON-объект полей для передачи в Битрикс24 (ключи — ID полей API)',
                    displayOptions: {
                        show: {
                            operation: ['create', 'update'],
                            inputMode: ['json'],
                        },
                    },
                },
                {
                    displayName: 'Оригинальные имена UF-полей',
                    name: 'useOriginalUfNames',
                    type: 'boolean',
                    default: true,
                    description: 'Использовать оригинальные имена пользовательских полей (UF_CRM_...) вместо camelCase (ufCrm...)',
                    displayOptions: {
                        show: {
                            operation: ['create', 'update', 'get'],
                        },
                    },
                },
                {
                    displayName: 'Вернуть полную запись',
                    name: 'returnFullItem',
                    type: 'boolean',
                    default: true,
                    description: 'Вернуть полные данные записи из Битрикс24 (для создания, изменения и получения)',
                    displayOptions: {
                        show: {
                            operation: ['create', 'update', 'get'],
                        },
                    },
                },
            ],
        };
        this.methods = {
            loadOptions: {
                async getSmartProcesses() {
                    const response = await GenericFunctions_1.bitrixApiRequest.call(this, 'crm.type.list', {});
                    const types = response.result?.types || [];
                    return types
                        .map((type) => ({
                        name: `${type.title} (${type.entityTypeId})`,
                        value: type.entityTypeId,
                        description: `ID типа: ${type.id}, entityTypeId: ${type.entityTypeId}`,
                    }))
                        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
                },
                async getFields() {
                    const resource = this.getCurrentNodeParameter('resource');
                    const operation = this.getCurrentNodeParameter('operation');
                    const smartProcessEntityTypeId = this.getCurrentNodeParameter('smartProcessEntityTypeId');
                    if (resource === 'smartProcess' && !smartProcessEntityTypeId) {
                        return [
                            {
                                name: '— Сначала выберите смарт-процесс —',
                                value: '',
                            },
                        ];
                    }
                    const entityTypeId = (0, GenericFunctions_1.getEntityTypeId)(resource, smartProcessEntityTypeId);
                    const fields = await (0, GenericFunctions_1.fetchBitrixFields)(this, entityTypeId);
                    const skipReadOnly = operation === 'create' || operation === 'update';
                    const filtered = fields.filter((field) => {
                        if (field.key === 'id')
                            return false;
                        if (skipReadOnly && field.isReadOnly)
                            return false;
                        return true;
                    });
                    filtered.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
                    return filtered.map((field) => ({
                        name: (0, GenericFunctions_1.formatFieldLabel)(field),
                        value: field.key,
                        description: `Тип: ${field.type}${field.isRequired ? ', обязательное' : ''}`,
                    }));
                },
            },
        };
    }
    async execute() {
        const items = this.getInputData();
        const returnData = [];
        for (let i = 0; i < items.length; i++) {
            try {
                const resource = this.getNodeParameter('resource', i);
                const operation = this.getNodeParameter('operation', i);
                const smartProcessEntityTypeId = this.getNodeParameter('smartProcessEntityTypeId', i, 0);
                const entityTypeId = (0, GenericFunctions_1.getEntityTypeId)(resource, smartProcessEntityTypeId || undefined);
                const useOriginalUfNames = this.getNodeParameter('useOriginalUfNames', i, true);
                let response;
                if (operation === 'create') {
                    const fields = await resolveFields(this, i, entityTypeId);
                    response = await GenericFunctions_1.bitrixApiRequest.call(this, 'crm.item.add', {
                        entityTypeId,
                        fields,
                        useOriginalUfNames: useOriginalUfNames ? 'Y' : 'N',
                    });
                    const returnFullItem = this.getNodeParameter('returnFullItem', i, true);
                    returnData.push({
                        json: returnFullItem
                            ? response.result?.item || response
                            : {
                                id: response.result?.item?.id,
                                success: true,
                            },
                        pairedItem: { item: i },
                    });
                    continue;
                }
                if (operation === 'update') {
                    const recordId = Number(this.getNodeParameter('recordId', i));
                    const fields = await resolveFields(this, i, entityTypeId);
                    response = await GenericFunctions_1.bitrixApiRequest.call(this, 'crm.item.update', {
                        entityTypeId,
                        id: recordId,
                        fields,
                        useOriginalUfNames: useOriginalUfNames ? 'Y' : 'N',
                    });
                    const returnFullItem = this.getNodeParameter('returnFullItem', i, true);
                    returnData.push({
                        json: returnFullItem
                            ? response.result?.item || response
                            : { id: recordId, success: true },
                        pairedItem: { item: i },
                    });
                    continue;
                }
                if (operation === 'delete') {
                    const recordId = Number(this.getNodeParameter('recordId', i));
                    await GenericFunctions_1.bitrixApiRequest.call(this, 'crm.item.delete', {
                        entityTypeId,
                        id: recordId,
                    });
                    returnData.push({
                        json: { id: recordId, success: true, deleted: true },
                        pairedItem: { item: i },
                    });
                    continue;
                }
                if (operation === 'get') {
                    const recordId = Number(this.getNodeParameter('recordId', i));
                    response = await GenericFunctions_1.bitrixApiRequest.call(this, 'crm.item.get', {
                        entityTypeId,
                        id: recordId,
                        useOriginalUfNames: useOriginalUfNames ? 'Y' : 'N',
                    });
                    returnData.push({
                        json: response.result?.item || response,
                        pairedItem: { item: i },
                    });
                    continue;
                }
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Неподдерживаемая операция: ${operation}`, {
                    itemIndex: i,
                });
            }
            catch (error) {
                if (this.continueOnFail()) {
                    returnData.push({
                        json: {
                            error: error instanceof Error ? error.message : 'Unknown error',
                        },
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
exports.Bitrix24 = Bitrix24;
