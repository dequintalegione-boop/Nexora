# Nexora

Персональная система управления жизнью, задачами и временем (PWA).

## Как запустить

> **Важно:** не открывай `index.html` двойным кликом. Это React + Vite — нужен dev-сервер.

```bash
git clone https://github.com/dequintalegione-boop/Nexora.git
cd Nexora
npm install
npm run dev
```

Открой в браузере адрес, который покажет Vite (обычно **http://localhost:5173**).

## Что уже работает

- Dashboard со счётчиками из локальной БД
- **Задачи** — создание, фильтры, статусы, приоритеты, удаление
- **Ежедневник** — настроение, энергия, мысли, рефлексия, фокус на завтра
- Тёмный glass UI, боковая навигация
- Данные в IndexedDB (Dexie), без сервера

## Стек

Vite · React 19 · TypeScript · Tailwind CSS v4 · Dexie · Zustand · React Router

## Документация

- [PRODUCT_SPECIFICATION.md](docs/PRODUCT_SPECIFICATION.md)
- [ROADMAP.md](docs/ROADMAP.md)
- [PWA_ARCHITECTURE.md](docs/PWA_ARCHITECTURE.md)
- [DATA_AND_MIGRATION.md](docs/DATA_AND_MIGRATION.md)
