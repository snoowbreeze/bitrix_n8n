import type { IExecuteFunctions, ILoadOptionsFunctions, ResourceMapperField } from 'n8n-workflow';
export declare function parseParamsFromApidocsHtml(html: string): ResourceMapperField[];
/**
 * Парсит текст параметров из bitrix-method-details (field=params).
 */
export declare function parseMethodParamsText(text: string): ResourceMapperField[];
export declare function fetchMethodParamsFromDocs(context: ILoadOptionsFunctions | IExecuteFunctions, method: string): Promise<ResourceMapperField[]>;
