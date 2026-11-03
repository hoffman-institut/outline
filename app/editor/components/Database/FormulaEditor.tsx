import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { Column } from "@shared/editor/lib/database";
import { formulaError } from "@shared/editor/lib/formula";
import { s } from "@shared/styles";
import { MenuLabel, MenuRow } from "./components";
import { useDatabase } from "./context";

// The formula language has Russian function names (like Excel in Russian),
// so the help is written in Russian whatever the interface language.
const help: { group: string; items: [string, string][] }[] = [
  {
    group: "Основы",
    items: [
      ["[Цена] * [Количество]", "столбцы — в квадратных скобках"],
      ["+ − * / ^", "арифметика, ^ — степень"],
      ['"Итого: " & [Сумма]', "& склеивает текст"],
      ["= <> < > <= >=", "сравнение, текст без учёта регистра"],
      [
        "СУММ([А]; [Б])",
        "пустая ячейка в арифметике даёт пусто; СУММ считает её нулём",
      ],
    ],
  },
  {
    group: "Логика",
    items: [
      ['ЕСЛИ([Сумма] > 100000; "Крупный"; "Обычный")', "условие"],
      ["И(…) ИЛИ(…) НЕ(…)", "и, или, не"],
      ["ЕПУСТО([Телефон])", "ячейка пустая"],
      ["ИСТИНА ЛОЖЬ", "логические значения"],
    ],
  },
  {
    group: "Числа",
    items: [
      ["СУММ СРЗНАЧ МИН МАКС", "сумма, среднее, минимум, максимум"],
      ["СЧЁТ СЧЁТЗ", "количество чисел, количество непустых"],
      ["ОКРУГЛ([Сумма]; 2)", "округление; ОКРУГЛВВЕРХ, ОКРУГЛВНИЗ"],
      ["ЦЕЛОЕ ABS ОСТАТ", "целая часть, модуль, остаток"],
    ],
  },
  {
    group: "Текст",
    items: [
      ['СЦЕП([Имя]; " "; [Фамилия])', "склеить"],
      ["ДЛСТР ПРОПИСН СТРОЧН СЖПРОБЕЛЫ", "длина, регистр, лишние пробелы"],
      ["ЛЕВСИМВ([Код]; 3) ПРАВСИМВ", "первые и последние символы"],
      ['ПОДСТАВИТЬ([Телефон]; "-"; "")', "заменить"],
      ['СОДЕРЖИТ([Теги]; "VIP")', "есть ли значение или подстрока"],
    ],
  },
  {
    group: "Даты",
    items: [
      ["СЕГОДНЯ() ДАТА(2026; 12; 31)", "сегодня, дата из чисел"],
      ["[Дата] + 7", "дата через 7 дней; дата − дата = дни"],
      ["ГОД МЕСЯЦ ДЕНЬ", "части даты"],
      [
        'РАЗНДАТ([Дата рождения]; СЕГОДНЯ(); "г")',
        "возраст; «м» — месяцы, «д» — дни",
      ],
      ["ДНЕЙ_ДО([Дата рождения])", "дней до ближайшей годовщины"],
      ["ДНИ([Конец]; [Начало])", "дней между датами"],
    ],
  },
];

/** Formula of a formula column, with column shortcuts and a short help. */
export function FormulaEditor({ column }: { column: Column }) {
  const { t } = useTranslation();
  const { data, computed, mutator } = useDatabase();
  const [draft, setDraft] = React.useState(column.formula ?? "");
  const [showHelp, setShowHelp] = React.useState(false);
  const input = React.useRef<HTMLTextAreaElement>(null);
  const saved = column.formula ?? "";
  const syntaxError = draft.trim() ? formulaError(draft) : undefined;
  // A calculation error of the saved formula, e.g. a missing column.
  const rowError =
    draft === saved
      ? computed.rows.map((row) => row.errors?.[column.id]).find(Boolean)
      : undefined;

  const save = () => {
    const formula = draft.trim();
    if (formula !== saved) {
      mutator.setColumns(
        data.columns.map((c) => (c.id === column.id ? { ...c, formula } : c))
      );
    }
  };

  const insert = (text: string) => {
    const field = input.current;
    const start = field?.selectionStart ?? draft.length;
    const end = field?.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, start) + text + draft.slice(end));
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + text.length, start + text.length);
    });
  };

  return (
    <>
      <MenuLabel>{t("Formula")}</MenuLabel>
      <Input
        ref={input}
        value={draft}
        rows={3}
        spellCheck={false}
        placeholder="[Цена] * [Количество]"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            save();
          }
        }}
      />
      {(syntaxError || rowError) && (
        <Message>{syntaxError ?? rowError}</Message>
      )}
      <Refs>
        {data.columns
          .filter((c) => c.id !== column.id)
          .map((c) => (
            <Ref
              key={c.id}
              type="button"
              // Keep the focus in the formula while inserting.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insert(`[${c.name}]`)}
            >
              {c.name}
            </Ref>
          ))}
      </Refs>
      <MenuRow type="button" onClick={() => setShowHelp(!showHelp)}>
        {showHelp ? "▾" : "▸"} {t("Formula help")}
      </MenuRow>
      {showHelp && (
        <Help>
          {help.map((section) => (
            <React.Fragment key={section.group}>
              <HelpGroup>{section.group}</HelpGroup>
              {section.items.map(([code, text]) => (
                <HelpItem key={code}>
                  <code>{code}</code> — {text}
                </HelpItem>
              ))}
            </React.Fragment>
          ))}
        </Help>
      )}
    </>
  );
}

const Input = styled.textarea`
  width: 100%;
  padding: 6px 8px;
  border: 1px solid ${s("inputBorder")};
  border-radius: 4px;
  background: ${s("background")};
  color: ${s("text")};
  font-family: ${s("fontFamilyMono")};
  font-size: 13px;
  line-height: 1.4;
  resize: vertical;
  outline: none;

  &:focus {
    border-color: ${s("accent")};
  }
`;

const Message = styled.div`
  padding: 2px 8px;
  color: ${s("danger")};
  font-size: 13px;
`;

const Refs = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px 0;
`;

const Ref = styled.button`
  padding: 1px 6px;
  border: 1px solid ${s("divider")};
  border-radius: 4px;
  background: none;
  color: ${s("textSecondary")};
  font-size: 12px;
  cursor: pointer;

  &:hover {
    color: ${s("text")};
    border-color: ${s("textTertiary")};
  }
`;

const Help = styled.div`
  max-height: 260px;
  overflow-y: auto;
  padding: 0 8px 4px;
  font-size: 12px;
  line-height: 1.5;
  color: ${s("textSecondary")};

  code {
    font-family: ${s("fontFamilyMono")};
    color: ${s("text")};
  }
`;

const HelpGroup = styled.div`
  margin-top: 6px;
  color: ${s("textTertiary")};
  font-weight: 500;
`;

const HelpItem = styled.div`
  margin: 2px 0;
`;
