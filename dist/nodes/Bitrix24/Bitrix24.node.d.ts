import type { IExecuteFunctions, ILoadOptionsFunctions, INodeExecutionData, INodePropertyOptions, INodeType, INodeTypeDescription } from 'n8n-workflow';
export declare class Bitrix24 implements INodeType {
    description: INodeTypeDescription;
    methods: {
        loadOptions: {
            getSmartProcesses(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]>;
            getFields(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]>;
        };
    };
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
}
