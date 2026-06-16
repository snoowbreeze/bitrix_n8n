import type {
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class Bitrix24WebhookApi implements ICredentialType {
	name = 'bitrix24WebhookApi';

	displayName = 'Битрикс24 — Входящий вебхук';

	documentationUrl = 'https://apidocs.bitrix24.ru/local-integrations/local-webhooks.html';

	properties: INodeProperties[] = [
		{
			displayName: 'URL вебхука',
			name: 'webhookUrl',
			type: 'string',
			default: '',
			placeholder: 'https://ваш-портал.bitrix24.ru/rest/1/xxxxxxxxxx/',
			description:
				'Полный URL входящего вебхука из Битрикс24 (Разработчикам → Другое → Входящий вебхук)',
			required: true,
		},
	];

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.webhookUrl.replace(/\\/?$/, "")}}',
			url: '/user.current',
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
	};
}
