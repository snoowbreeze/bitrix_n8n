import type { IDataObject, IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
export declare const ENTITY_TYPE_IDS: Record<string, number>;
export interface BitrixFieldMeta {
    key: string;
    title: string;
    upperName: string;
    type: string;
    isRequired: boolean;
    isReadOnly: boolean;
    isMultiple: boolean;
}
export declare const MULTIFIELD_TYPE = "crm_multifield";
export declare const MULTIFIELD_RAW_KEY = "fm";
export declare const MULTIFIELD_KEY_PREFIX = "fm:";
export interface MultifieldDef {
    code: string;
    title: string;
    defaultValueType: string;
}
export declare const MULTIFIELD_DEFS: MultifieldDef[];
export declare function normalizeWebhookUrl(url: string): string;
export declare function getEntityTypeId(resource: string, smartProcessEntityTypeId?: number): number;
export declare function bitrixApiRequest(this: IExecuteFunctions | ILoadOptionsFunctions, method: string, body?: IDataObject): Promise<IDataObject>;
export declare function formatFieldLabel(field: BitrixFieldMeta): string;
export declare function isMultifieldKey(fieldId: string): boolean;
/**
 * Преобразует значение одного виртуального мультиполя (например, «Телефон»)
 * в массив записей формата `fm`: [{ typeId, valueType, value }].
 * Принимает простую строку, несколько строк (разделитель — перевод строки),
 * а также готовый JSON-массив/объект.
 */
export declare function buildMultifieldEntries(code: string, rawValue: unknown): IDataObject[];
export declare function parseFieldValue(rawValue: unknown, fieldType: string): unknown;
export declare function buildFieldsObject(fieldValues: IDataObject[], fieldMetaMap: Map<string, BitrixFieldMeta>): IDataObject;
export declare function fetchBitrixFields(context: ILoadOptionsFunctions | IExecuteFunctions, entityTypeId: number): Promise<BitrixFieldMeta[]>;
export declare function fetchAvailableMethods(context: ILoadOptionsFunctions | IExecuteFunctions): Promise<string[]>;
/**
 * Достаёт массив элементов из ответа списочного метода.
 * Bitrix возвращает либо result=[...], либо result={items:[...]} / {tasks:[...]} и т.п.
 */
export declare function extractListItems(result: unknown): {
    items: IDataObject[];
    wrapperKey: string | null;
};
/**
 * Вызов списочного метода с автоматической постраничной выборкой через next/start.
 */
export declare function bitrixApiRequestAllItems(this: IExecuteFunctions, method: string, body?: IDataObject, maxItems?: number): Promise<IDataObject[]>;
