import type { IExecuteFunctions, ILoadOptionsFunctions, ResourceMapperField } from 'n8n-workflow';
export type MethodSpec = {
    kind: 'entityFields';
    entity: string;
    op: 'add' | 'update';
} | {
    kind: 'docParams';
} | {
    kind: 'none';
};
/**
 * Определяет стратегию загрузки параметров для метода.
 * По умолчанию — из официальной документации через MCP Bitrix24.
 */
export declare function getMethodSpec(method: string): MethodSpec;
export declare function fetchLegacyEntityFields(context: ILoadOptionsFunctions | IExecuteFunctions, entity: string, op: 'add' | 'update'): Promise<ResourceMapperField[]>;
export declare function fetchMethodParameters(context: ILoadOptionsFunctions | IExecuteFunctions, method: string): Promise<ResourceMapperField[]>;
export declare function coerceValueByType(value: unknown, type: ResourceMapperField['type']): unknown;
