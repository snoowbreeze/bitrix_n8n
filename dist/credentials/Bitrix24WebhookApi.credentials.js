"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bitrix24WebhookApi = void 0;
class Bitrix24WebhookApi {
    constructor() {
        this.name = 'bitrix24WebhookApi';
        this.displayName = 'Битрикс24 — Входящий вебхук';
        this.documentationUrl = 'https://apidocs.bitrix24.ru/local-integrations/local-webhooks.html';
        this.properties = [
            {
                displayName: 'URL вебхука',
                name: 'webhookUrl',
                type: 'string',
                default: '',
                placeholder: 'https://ваш-портал.bitrix24.ru/rest/1/xxxxxxxxxx/',
                description: 'Полный URL входящего вебхука из Битрикс24 (Разработчикам → Другое → Входящий вебхук)',
                required: true,
            },
        ];
        this.test = {
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
}
exports.Bitrix24WebhookApi = Bitrix24WebhookApi;
