import type { FormulaValue } from "./formula";
import { evaluateFormula, formulaError, renameFormulaRef } from "./formula";

const today = "2026-11-04";

function run(source: string, refs: Record<string, FormulaValue> = {}) {
  return evaluateFormula(source, {
    today,
    ref: (name) => {
      if (!(name in refs)) {
        throw new Error(`no ${name}`);
      }
      return refs[name];
    },
  });
}

const errorOf = (source: string, refs: Record<string, FormulaValue> = {}) => {
  try {
    run(source, refs);
    return undefined;
  } catch (error) {
    return (error as Error).message;
  }
};

describe("formula arithmetic", () => {
  it("follows operator precedence", () => {
    expect(run("1 + 2 * 3")).toBe(7);
    expect(run("(1 + 2) * 3")).toBe(9);
    expect(run("2 ^ 3 * 2")).toBe(16);
    expect(run("-2 + 5")).toBe(3);
    expect(run("10 / 4")).toBe(2.5);
  });

  it("reads decimal commas and points", () => {
    expect(run("1,5 * 2")).toBe(3);
    expect(run("1.5 * 2")).toBe(3);
  });

  it("uses column values", () => {
    expect(run("[Цена] * [Количество]", { Цена: 1500, Количество: 3 })).toBe(
      4500
    );
    // Arithmetic with an empty cell is empty; СУММ counts it as zero.
    expect(run("[Цена] + 1", { Цена: null })).toBeNull();
    expect(run("СУММ([Цена]; 1)", { Цена: null })).toBe(1);
  });

  it("joins text with &", () => {
    expect(run('"Итого: " & [Сумма]', { Сумма: 1250.5 })).toBe("Итого: 1250,5");
  });

  it("compares text without case", () => {
    expect(run('"Москва" = "москва"')).toBe(true);
    expect(run("[a] <> 3", { a: 3 })).toBe(false);
    expect(run("[a] >= 3", { a: 4 })).toBe(true);
    expect(run("[a] < 3", { a: null })).toBeNull();
    expect(run('[a] <> "да"', { a: null })).toBe(true);
  });
});

describe("formula functions", () => {
  it("ЕСЛИ chooses a branch", () => {
    const f = 'ЕСЛИ([Сумма] > 100000; "Крупный"; "Обычный")';
    expect(run(f, { Сумма: 250000 })).toBe("Крупный");
    expect(run(f, { Сумма: 100 })).toBe("Обычный");
    expect(run("ЕСЛИ(ЛОЖЬ; 1)")).toBeNull();
  });

  it("evaluates only the chosen branch", () => {
    expect(run("ЕСЛИ([a] = 0; 0; 1 / [a])", { a: 0 })).toBe(0);
  });

  it("rounds like Excel", () => {
    expect(run("ОКРУГЛ(2,345; 2)")).toBe(2.35);
    expect(run("ОКРУГЛ(-2,5)")).toBe(-3);
    expect(run("ОКРУГЛ(1234; -2)")).toBe(1200);
    expect(run("ОКРУГЛВВЕРХ(2,01)")).toBe(3);
    expect(run("ОКРУГЛВНИЗ(2,99)")).toBe(2);
    expect(run("ОСТАТ(-3; 2)")).toBe(1);
  });

  it("aggregates numbers and lists", () => {
    expect(run("СУММ(1; 2; [list])", { list: [3, null, 4] })).toBe(10);
    expect(run("СРЗНАЧ(2; 4)")).toBe(3);
    expect(run("МАКС([list])", { list: [3, 9, 4] })).toBe(9);
    expect(run("СЧЁТЗ([list])", { list: ["a", "", "b"] })).toBe(2);
    expect(run('СЧЕТ(1; "x"; "2")')).toBe(2);
  });

  it("works with text", () => {
    expect(run('СЦЕП("a"; 1; "b")')).toBe("a1b");
    expect(run('ПРОПИСН("abc")')).toBe("ABC");
    expect(run('ЛЕВСИМВ("Привет"; 3)')).toBe("При");
    expect(run('ПОДСТАВИТЬ("a-b-c"; "-"; "+")')).toBe("a+b+c");
    expect(run('СОДЕРЖИТ([Теги]; "важно")', { Теги: ["Важно", "VIP"] })).toBe(
      true
    );
    expect(run("ЕПУСТО([x])", { x: [] })).toBe(true);
  });

  it("calculates with dates", () => {
    const born = { date: "1990-11-10" };
    expect(run("[Дата] + 7", { Дата: { date: "2026-12-28" } })).toEqual({
      date: "2027-01-04",
    });
    expect(run("ДНИ([b]; [a])", { a: born, b: { date: "1990-12-10" } })).toBe(
      30
    );
    expect(run('РАЗНДАТ([ДР]; СЕГОДНЯ(); "г")', { ДР: born })).toBe(35);
    expect(run("ДНЕЙ_ДО([ДР])", { ДР: born })).toBe(6);
    expect(run("ГОД(ДАТА(2026; 13; 1))")).toBe(2027);
    expect(run("ГОД([x])", { x: null })).toBeNull();
    expect(run("[x] + 7", { x: null })).toBeNull();
    expect(run('ДАТА(2026; 2; 5) = "05.02.2026"')).toBe(true);
  });
});

describe("formula errors", () => {
  it("reports syntax errors", () => {
    expect(formulaError("[Цена] * ")).toBe("формула не закончена");
    expect(formulaError('"abc')).toBe("не закрыта кавычка");
    expect(formulaError("[Цена")).toBe("не закрыта скобка «]»");
    expect(formulaError("СУМ(1)")).toBe("неизвестная функция «СУМ»");
    expect(formulaError("Цена * 2")).toContain("[Цена]");
    expect(formulaError("ОКРУГЛ()")).toContain("ОКРУГЛ");
    expect(formulaError("1 2")).toContain("лишнее");
    expect(formulaError("")).toBe("формула пустая");
    expect(formulaError("сумм(1; 2)")).toBeUndefined();
  });

  it("reports calculation errors", () => {
    expect(errorOf("1 / 0")).toContain("#ДЕЛ/0!");
    expect(errorOf('"abc" * 2')).toBe("«abc» — не число");
  });
});

describe("renameFormulaRef", () => {
  it("renames references but not quoted text", () => {
    expect(
      renameFormulaRef('[Цена] * 2 & "[Цена]" & [ цена ]', "Цена", "Стоимость")
    ).toBe('[Стоимость] * 2 & "[Цена]" & [Стоимость]');
  });
});
