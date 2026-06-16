import type { IExecuteFunctions, ILoadOptionsFunctions, INodeExecutionData, INodeListSearchResult, INodeType, INodeTypeDescription, ResourceMapperFields } from 'n8n-workflow';
export declare class Bitrix24Universal implements INodeType {
    description: INodeTypeDescription;
    methods: {
        listSearch: {
            searchMethods(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult>;
        };
        resourceMapping: {
            getMethodParameters(this: ILoadOptionsFunctions): Promise<ResourceMapperFields>;
        };
    };
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
}
