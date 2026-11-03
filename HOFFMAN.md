# Outline — сборка Института Хоффмана

Исходники Outline с доработками для https://wiki.hoffman-institut.ru. Развёртывание, бэкапы и сервер описаны в репозитории `hoffman-institut/hoffman-wiki`.

## Что изменено относительно Outline

Каждая доработка — отдельный коммит поверх импорта исходников (`git log`):

- **Русский интерфейс**: язык `ru_RU`, перевод `shared/i18n/locales/ru_RU/translation.json`, русские даты.
- **Поиск с русской морфологией**: в коде `russian` вместо `english`. Функции поиска в базе данных переключает `deploy/ru-search.sh` из hoffman-wiki — запускать после каждого обновления.
- **«Архив»** для раздела (i18n-контекст `section`), «Архивировать» — для действия.
- **Страница входа**: заголовок в две строки и описание, вход по почте первым, служебный вход (Dex) — ссылкой «Только для администратора».
- Перевод кэшируется в браузере на час, а не на неделю.

## Сборка

Образ собирает GitHub Actions (`.github/workflows/image.yml`) по тегу вида `v<версия Outline>-h<номер>`:

```bash
git tag v1.11.0-h2 && git push origin v1.11.0-h2
```

Результат — `ghcr.io/hoffman-institut/outline:1.11.0-h2`. Сборка идёт 30–60 минут и проверяет, что доработки попали в образ.

## Выкатка

На сервере wiki (`ssh hoffman-mattermost`, `/root/outline`):

1. `/root/backup_outline.sh`
2. В `docker-compose.yml` поменять тег образа.
3. `docker-compose pull outline && docker-compose up -d outline`
4. `./ru-search.sh`
5. Проверить `/_health`, страницу входа, русский интерфейс, поиск.

Откат — прежний тег в `docker-compose.yml` и `docker-compose up -d outline`.

## Обновление Outline

1. Новая ветка с импортом новой версии: `git fetch https://github.com/outline/outline.git tag v<X> --depth 1` и коммит её дерева «Import Outline v<X>».
2. Перенести поверх коммиты Хоффмана (`git cherry-pick`), разрешить конфликты.
3. Дополнить перевод новыми строками из `shared/i18n/locales/en_US/translation.json`.
4. Тег `v<X>-h1` → сборка → выкатка по шагам выше.
