# Блок «База данных» — устройство и ход работ

Базы данных внутри документов, как в Yonote/Notion, без отдельного сервиса. Блок вставляется через `/база` (`/database`).

## Модель данных

Данные живут в самом документе (ProseMirror → Y.js → PostgreSQL), поэтому права, история, совместная работа, поиск и API работают как для обычного текста.

- Узел `database` (блок, atom, `content: "database_row*"`). Атрибуты:
  - `id` — идентификатор блока.
  - `title` — название базы.
  - `columns: Column[]` — столбцы. `Column = { id, name, type, options?, width? }`, где тип — `text | number | select | multi_select | date | person | checkbox | url | email | phone`. `options = [{ id, name, color }]` — для `select` и `multi_select`.
  - `views: View[]` — виды. `View = { id, name, type, sort, filters, hidden, groupBy?, dateColumn?, recurring? }`, где тип — `table | board | calendar`.
- Узел `database_row` (atom, лист). Атрибуты `{ id, cells: { [columnId]: value }, docId? }`.
  - Каждая строка — отдельный узел, поэтому одновременная правка разных строк не конфликтует. В пределах одной строки побеждает последняя правка.
  - Значения ячеек:
    - текст, ссылка, почта, телефон — строка;
    - число — number;
    - выбор — id варианта; несколько вариантов — массив id;
    - дата — `YYYY-MM-DD`;
    - человек — массив id пользователей;
    - флажок — boolean.
  - `docId` — страница строки (дочерний документ), этап 3.
- Порядок строк в документе — ручной порядок. Сортировка вида только меняет порядок показа, документ не меняет.
- Сортировка `upcoming` для дат — по ближайшей годовщине без учёта года (дни рождения).

## Markdown

API, MCP и импорт работают через markdown (`applyMarkdownToDocument`), поиск индексирует `documents.text`. Поэтому база сериализуется без потерь в блок:

````
```hoffman-database
{ "title": …, "columns": […], "views": […], "rows": […] }
```
````

Правило markdown-it превращает такой блок в токены `database_open` / `database_row` / `database_close`.

## Файлы

- `shared/editor/lib/database.ts` — типы, значения по умолчанию, форматирование, сортировка и фильтры (общий код для клиента и сервера) + тесты.
- `shared/editor/nodes/Database.ts`, `DatabaseRow.ts` — схема, markdown, команды. Подключены в `richExtensions`.
- `shared/editor/rules/database.ts` — правило markdown-it.
- `app/editor/nodes/DatabaseView.tsx` — клиентский подкласс с React-компонентом. Подменяется в `withUIExtensions`.
- `app/editor/components/Database/*` — интерфейс: таблица, канбан, календарь, меню столбцов, редакторы ячеек.
- `app/editor/components/ComponentView.tsx` — события внутри `[data-database-ui]` не уходят в ProseMirror.

## Этапы

- [x] 1. Вид «Таблица»:
  - все типы столбцов, варианты с цветами;
  - сортировка (включая `upcoming`), фильтры, скрытие столбцов;
  - добавление и удаление строк и столбцов;
  - перестановка перетаскиванием: столбцы — за заголовок (или «Влево/Вправо» в меню), строки — за ручку ⠿ слева. Строки двигаются, только если у вида нет сортировки;
  - markdown/MCP, поиск, перевод;
  - перенос 6 баз из Yonote.
- [x] 2. Несколько видов, «Канбан» (группировка по выбору, перетаскивание), «Календарь» (по дате, ежегодный повтор).
- [x] 3а. Строка как страница (дочерний документ, кнопка «Создать страницу» в карточке строки).
- [ ] 3б. Напоминания о ближайших днях рождения в Mattermost.

## Стенд

Сервер Nextcloud, `/root/outline-staging/staging.sh up <образ>`. Доступ — туннель `ssh -L 3100:127.0.0.1:3100 -L 8025:127.0.0.1:8025 hoffman-nextcloud`. Вход — `staging-admin@hoffman-institut.ru`, письмо со ссылкой — в Mailpit `http://localhost:8025`. База на стенде — копия рабочей wiki от 03.11.2026.
