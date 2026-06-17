#!/usr/bin/env node
/**
 * Скачивает поисковый реестр apidocs.bitrix24.ru и строит индекс method → url.
 * Запускается при сборке пакета.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APIDOCS_BASE = 'https://apidocs.bitrix24.ru';
const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '../nodes/Bitrix24Universal/apidocs-method-urls.json');

function methodToSlug(method) {
	return method.trim().toLowerCase().replace(/\./g, '-');
}

function scoreEntry(method, url, title) {
	const slug = methodToSlug(method);
	let score = 0;

	if (title.toLowerCase().includes(method.toLowerCase())) score += 1;
	if (title.trim().toLowerCase().endsWith(method.toLowerCase())) score += 10;
	if (url.endsWith(`${slug}.html`)) score += 8;
	if (url.includes(`/${slug}.html`)) score += 4;
	score += Math.max(0, 40 - url.split('/').length);

	return score;
}

async function fetchText(url) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status} for ${url}`);
	}
	return response.text();
}

async function resolveRegistryUrl() {
	const resourcesText = await fetchText(`${APIDOCS_BASE}/_search/ru/1781001004204-resources.js`).catch(
		async () => {
			// Путь к resources.js меняется при обновлении документации — ищем в HTML главной.
			const html = await fetchText(`${APIDOCS_BASE}/api-reference/`);
			const match = html.match(/_search\/ru\/[a-z0-9]+-resources\.js/);
			if (!match) {
				throw new Error('Не удалось найти resources.js в apidocs');
			}
			return fetchText(`${APIDOCS_BASE}/${match[0]}`);
		},
	);

	const match = resourcesText.match(/"registry":"([^"]+)"/);
	if (!match) {
		throw new Error('Не удалось найти путь к registry в resources.js');
	}
	return `${APIDOCS_BASE}/${match[1]}`;
}

function buildIndex(registryText) {
	const index = new Map();
	const pagePattern = /"(api-reference\/[^"]+\.html)":\{"title":"([^"]+)"/g;
	const methodPattern = /\b[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]+)+\b/gi;

	for (const match of registryText.matchAll(pagePattern)) {
		const [, url, title] = match;
		const methods = new Set(title.match(methodPattern) || []);

		for (const rawMethod of methods) {
			const method = rawMethod.toLowerCase();
			const score = scoreEntry(method, url, title);
			const prev = index.get(method);

			if (!prev || score > prev.score) {
				index.set(method, { url, score });
			}
		}
	}

	const result = {};
	for (const [method, { url }] of [...index.entries()].sort(([a], [b]) => a.localeCompare(b))) {
		result[method] = url;
	}

	return result;
}

async function main() {
	const indexExists = await import('node:fs').then((fs) =>
		fs.existsSync(outPath),
	);

	try {
		console.log('Загрузка registry apidocs...');
		const registryUrl = await resolveRegistryUrl();
		console.log('Registry:', registryUrl);
		const registryText = await fetchText(registryUrl);
		const index = buildIndex(registryText);

		mkdirSync(dirname(outPath), { recursive: true });
		writeFileSync(outPath, JSON.stringify(index, null, 2));

		console.log(`Индекс сохранён: ${outPath}`);
		console.log(`Методов: ${Object.keys(index).length}`);
	} catch (error) {
		if (indexExists) {
			console.warn('Не удалось обновить индекс apidocs, используется существующий файл.');
			console.warn(error instanceof Error ? error.message : error);
			return;
		}
		throw error;
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
