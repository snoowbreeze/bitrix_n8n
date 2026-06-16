# n8n-nodes-bitrix24

Кастомные ноды n8n для работы с Bitrix24 через входящий вебхук.

## Ноды

### Битрикс24
CRM-нода для лидов, сделок, контактов и смарт-процессов.

- Операции: создать, изменить, удалить, получить
- Поля подгружаются с портала в формате `Название (ID)`
- Режимы: Field Builder и JSON

### Битрикс24 (Универсальный)
Вызов любого REST-метода Bitrix24.

- Поиск метода из списка доступных по вебхуку
- **Авто (поля метода)** — параметры из официальной документации apidocs.bitrix24.ru
- Режимы JSON и ключ/значение
- Пакетный вызов `rest.batch`
- Пагинация для `*.list`, разбиение ответа на элементы

## Установка на сервер n8n

### 1. Клонировать репозиторий

```bash
git clone https://github.com/snoowbreeze/bitrix_n8n.git /opt/n8n-nodes-bitrix24
cd /opt/n8n-nodes-bitrix24
```

### 2. Собрать

```bash
npm install
npm run build
```

> При сборке нужен интернет: скачивается индекс методов с apidocs.bitrix24.ru.

### 3. Подключить к n8n

Добавьте в конфиг n8n (файл `~/.n8n/env`, systemd, docker-compose):

```env
N8N_CUSTOM_EXTENSIONS=/opt/n8n-nodes-bitrix24
```

Или положите проект в `~/.n8n/custom/n8n-nodes-bitrix24` — n8n подхватит автоматически.

### 4. Перезапустить n8n

```bash
systemctl --user restart n8n
# или
docker compose restart n8n
```

### Docker Compose (пример)

```yaml
services:
  n8n:
    image: n8nio/n8n
    environment:
      N8N_CUSTOM_EXTENSIONS: /custom/n8n-nodes-bitrix24
    volumes:
      - n8n_data:/home/node/.n8n
      - ./n8n-nodes-bitrix24:/custom/n8n-nodes-bitrix24
```

## Credentials

1. В Bitrix24: **Разработчикам → Другое → Входящий вебхук**
2. Выдайте нужные права (CRM, im, imbot и т.д.)
3. Скопируйте URL: `https://ваш-портал.bitrix24.ru/rest/1/xxxxx/`
4. В n8n: **Credentials → Bitrix24 Webhook API**

## Обновление

```bash
cd /opt/n8n-nodes-bitrix24
git pull
npm install
npm run build
systemctl --user restart n8n
```

## Разработка

```bash
npm run dev    # TypeScript watch
npm run build  # полная сборка
npm run build:index  # только индекс методов apidocs
```

## Требования

- n8n 2.x
- Node.js 18+
