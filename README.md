# Nexora

Персональная система управления жизнью, задачами и временем (PWA).

## Онлайн

После включения GitHub Pages приложение будет здесь:

**https://dequintalegione-boop.github.io/Nexora/**

## Локальный запуск

```bash
git clone https://github.com/dequintalegione-boop/Nexora.git
cd Nexora
npm install
npm run dev
```

Открой http://localhost:5173

> Не открывай `index.html` напрямую — нужен Vite.

## GitHub Pages

Деплой автоматический при каждом push в `main` (Actions → Deploy to GitHub Pages).

В настройках репозитория один раз включи:

**Settings → Pages → Build and deployment → Source: GitHub Actions**

## Что работает

- Dashboard
- Задачи (создание, фильтры, статусы, приоритеты)
- Ежедневник (настроение, энергия, рефлексия)
- Локальное хранение (IndexedDB / Dexie)
- Glass UI

## Стек

Vite · React 19 · TypeScript · Tailwind CSS v4 · Dexie · Zustand · React Router
