import { daysUntilAnniversary } from "./database";

/**
 * Formula language of database columns, modelled on Excel in Russian:
 * columns are referenced as [Name], functions have Russian names (ЕСЛИ,
 * СУММ, ОКРУГЛ…) and arguments are separated by ";". Formulas are parsed
 * into a tree and evaluated without eval, so they cannot run code.
 */

/** A date value inside a formula, "YYYY-MM-DD". */
export type FormulaDate = { date: string };

export type FormulaValue =
  | number
  | string
  | boolean
  | FormulaDate
  | FormulaValue[]
  | null;

/** Error shown in a cell instead of a value. */
export class FormulaError extends Error {}

type Node =
  | { kind: "value"; value: FormulaValue }
  | { kind: "ref"; name: string }
  | { kind: "call"; name: string; args: Node[] }
  | { kind: "negate"; arg: Node }
  | { kind: "binary"; op: string; left: Node; right: Node };

type Token =
  | { type: "num"; value: number }
  | { type: "str"; value: string }
  | { type: "ref"; value: string }
  | { type: "name"; value: string }
  | { type: "op"; value: string };

const operators = [
  "<=",
  ">=",
  "<>",
  "=",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "^",
  "&",
];

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    const number = /^\d+(?:[.,]\d+)?/.exec(source.slice(i));
    if (number) {
      tokens.push({
        type: "num",
        value: parseFloat(number[0].replace(",", ".")),
      });
      i += number[0].length;
      continue;
    }
    if (char === '"') {
      let value = "";
      i++;
      for (;;) {
        if (i >= source.length) {
          throw new FormulaError("не закрыта кавычка");
        }
        if (source[i] === '"') {
          if (source[i + 1] === '"') {
            value += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        value += source[i++];
      }
      tokens.push({ type: "str", value });
      continue;
    }
    if (char === "[") {
      const end = source.indexOf("]", i);
      if (end < 0) {
        throw new FormulaError("не закрыта скобка «]»");
      }
      tokens.push({ type: "ref", value: source.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    const name = /^[\p{L}_][\p{L}\p{N}_.]*/u.exec(source.slice(i));
    if (name) {
      tokens.push({ type: "name", value: name[0] });
      i += name[0].length;
      continue;
    }
    const op = operators.find((o) => source.startsWith(o, i));
    if (op) {
      tokens.push({ type: "op", value: op });
      i += op.length;
      continue;
    }
    if ("();,".includes(char)) {
      tokens.push({ type: "op", value: char === "," ? ";" : char });
      i++;
      continue;
    }
    throw new FormulaError(`неожиданный символ «${char}»`);
  }
  return tokens;
}

/** Function names are case-insensitive and Ё is the same as Е. */
const normalizeName = (name: string) => name.toUpperCase().replace(/Ё/g, "Е");

const levels = [
  ["=", "<>", "<", ">", "<=", ">="],
  ["&"],
  ["+", "-"],
  ["*", "/"],
  ["^"],
];

function parse(source: string): Node {
  const tokens = tokenize(source);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (value: string) =>
    peek()?.type === "op" && peek()?.value === value;
  const expect = (value: string) => {
    if (!isOp(value)) {
      throw new FormulaError(`ожидается «${value}»`);
    }
    pos++;
  };

  const binary = (level: number): Node => {
    if (level === levels.length) {
      return unary();
    }
    let left = binary(level + 1);
    for (;;) {
      const token = peek();
      if (token?.type !== "op" || !levels[level].includes(token.value)) {
        return left;
      }
      pos++;
      left = {
        kind: "binary",
        op: token.value,
        left,
        right: binary(level + 1),
      };
    }
  };

  const unary = (): Node => {
    if (isOp("-")) {
      pos++;
      return { kind: "negate", arg: unary() };
    }
    if (isOp("+")) {
      pos++;
      return unary();
    }
    return primary();
  };

  const primary = (): Node => {
    const token = tokens[pos++];
    if (!token) {
      throw new FormulaError("формула не закончена");
    }
    switch (token.type) {
      case "num":
      case "str":
        return { kind: "value", value: token.value };
      case "ref":
        return { kind: "ref", name: token.value };
      case "name": {
        const name = normalizeName(token.value);
        if (!isOp("(")) {
          if (name === "ИСТИНА" || name === "ЛОЖЬ") {
            return { kind: "value", value: name === "ИСТИНА" };
          }
          throw new FormulaError(
            `«${token.value}» — столбец пишется в скобках: [${token.value}]`
          );
        }
        if (!functions[name]) {
          throw new FormulaError(`неизвестная функция «${token.value}»`);
        }
        pos++;
        const args: Node[] = [];
        if (!isOp(")")) {
          args.push(binary(0));
          while (isOp(";")) {
            pos++;
            args.push(binary(0));
          }
        }
        expect(")");
        const [min, max] = functions[name].arity;
        if (args.length < min || args.length > max) {
          throw new FormulaError(
            min === max
              ? `${name}: нужно аргументов — ${min}`
              : `${name}: нужно аргументов — от ${min}${max === Infinity ? "" : ` до ${max}`}`
          );
        }
        return { kind: "call", name, args };
      }
      default:
        if (token.value === "(") {
          const inner = binary(0);
          expect(")");
          return inner;
        }
        throw new FormulaError(`неожиданный «${token.value}»`);
    }
  };

  if (!tokens.length) {
    throw new FormulaError("формула пустая");
  }
  const tree = binary(0);
  if (pos < tokens.length) {
    throw new FormulaError(`лишнее в конце: «${describe(tokens[pos])}»`);
  }
  return tree;
}

const describe = (token: Token) =>
  token.type === "ref" ? `[${token.value}]` : String(token.value);

// Parsed formulas are reused between rows and renders.
const cache = new Map<string, Node | FormulaError>();

function compile(source: string): Node {
  let tree = cache.get(source);
  if (!tree) {
    try {
      tree = parse(source);
    } catch (error) {
      tree =
        error instanceof FormulaError ? error : new FormulaError(String(error));
    }
    if (cache.size > 500) {
      cache.clear();
    }
    cache.set(source, tree);
  }
  if (tree instanceof FormulaError) {
    throw tree;
  }
  return tree;
}

/**
 * Checks a formula without evaluating it.
 *
 * @param source the formula.
 * @returns the error message, or undefined when the formula is valid.
 */
export function formulaError(source: string): string | undefined {
  try {
    compile(source);
    return undefined;
  } catch (error) {
    return error instanceof FormulaError ? error.message : String(error);
  }
}

/**
 * Column names used by a formula, in order of appearance.
 *
 * @param source the formula.
 * @returns the referenced names, or an empty list for an invalid formula.
 */
export function formulaRefs(source: string): string[] {
  try {
    return tokenize(source)
      .filter((t) => t.type === "ref")
      .map((t) => String(t.value));
  } catch {
    return [];
  }
}

/**
 * Renames a column reference in a formula, leaving text in quotes alone.
 *
 * @param source the formula.
 * @param from the old column name.
 * @param to the new column name.
 * @returns the updated formula.
 */
export function renameFormulaRef(
  source: string,
  from: string,
  to: string
): string {
  const key = from.trim().toLowerCase();
  let result = "";
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (char === '"') {
      let end = i + 1;
      while (end < source.length) {
        if (source[end] === '"' && source[end + 1] !== '"') {
          break;
        }
        end += source[end] === '"' ? 2 : 1;
      }
      result += source.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (char === "[") {
      const end = source.indexOf("]", i);
      if (
        end > 0 &&
        source
          .slice(i + 1, end)
          .trim()
          .toLowerCase() === key
      ) {
        result += `[${to}]`;
        i = end + 1;
        continue;
      }
    }
    result += char;
    i++;
  }
  return result;
}

// Conversions between value types.

const isDate = (value: FormulaValue): value is FormulaDate =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const dayMs = 86400000;

const dateToDays = (value: FormulaDate) =>
  Math.round(Date.parse(`${value.date}T00:00:00Z`) / dayMs);

const daysToDate = (days: number): FormulaDate => ({
  date: new Date(Math.round(days) * dayMs).toISOString().slice(0, 10),
});

function parseDate(text: string): FormulaDate | undefined {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const ru = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text.trim());
  const parts = iso
    ? [+iso[1], +iso[2], +iso[3]]
    : ru
      ? [+ru[3], +ru[2], +ru[1]]
      : undefined;
  return parts ? makeDate(parts[0], parts[1], parts[2]) : undefined;
}

function makeDate(year: number, month: number, day: number): FormulaDate {
  const time = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(time)) {
    throw new FormulaError("неверная дата");
  }
  return { date: new Date(time).toISOString().slice(0, 10) };
}

const isEmpty = (value: FormulaValue) =>
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

function toNumber(value: FormulaValue): number {
  if (value === null || value === "") {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (isDate(value)) {
    return dateToDays(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 1) {
      return toNumber(value[0]);
    }
    throw new FormulaError("список нельзя использовать как число");
  }
  const n = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n)) {
    throw new FormulaError(`«${value}» — не число`);
  }
  return n;
}

export function formatFormulaNumber(n: number): string {
  return n.toLocaleString("ru-RU", {
    maximumFractionDigits: 10,
    useGrouping: false,
  });
}

function toText(value: FormulaValue): string {
  if (value === null) {
    return "";
  }
  if (typeof value === "number") {
    return formatFormulaNumber(value);
  }
  if (typeof value === "boolean") {
    return value ? "ИСТИНА" : "ЛОЖЬ";
  }
  if (isDate(value)) {
    const [y, m, d] = value.date.split("-");
    return `${d}.${m}.${y}`;
  }
  if (Array.isArray(value)) {
    return value.map(toText).filter(Boolean).join(", ");
  }
  return value;
}

function toBool(value: FormulaValue): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  return !isEmpty(value);
}

function toDate(value: FormulaValue): FormulaDate | null {
  if (value === null || value === "") {
    return null;
  }
  if (isDate(value)) {
    return value;
  }
  if (typeof value === "number") {
    return daysToDate(value);
  }
  if (Array.isArray(value) && value.length === 1) {
    return toDate(value[0]);
  }
  const date = typeof value === "string" ? parseDate(value) : undefined;
  if (!date) {
    throw new FormulaError(`«${toText(value)}» — не дата`);
  }
  return date;
}

const flatten = (values: FormulaValue[]): FormulaValue[] =>
  values.flatMap((v) => (Array.isArray(v) ? flatten(v) : [v]));

function compare(a: FormulaValue, b: FormulaValue): number {
  const numeric = (v: FormulaValue) =>
    typeof v === "number" || typeof v === "boolean" || isDate(v);
  if ((numeric(a) || a === null) && (numeric(b) || b === null)) {
    return toNumber(a) - toNumber(b);
  }
  return toText(a).localeCompare(toText(b), "ru", { sensitivity: "base" });
}

function round(value: number, digits: number, mode: "round" | "up" | "down") {
  const factor = Math.pow(10, digits);
  const scaled = Math.abs(value) * factor;
  // Rounding away from zero like Excel; the epsilon hides float noise.
  const rounded =
    mode === "round"
      ? Math.round(scaled + 1e-9)
      : mode === "up"
        ? Math.ceil(scaled - 1e-9)
        : Math.floor(scaled + 1e-9);
  return (Math.sign(value) * rounded) / factor;
}

function numbersOf(values: FormulaValue[]): number[] {
  return flatten(values)
    .filter((v) => !isEmpty(v))
    .map(toNumber);
}

export type FormulaContext = {
  /** Value of a column of the current row, by column name. */
  ref: (name: string) => FormulaValue;
  /** Today as "YYYY-MM-DD". */
  today: string;
};

type Fn = {
  arity: [number, number];
  /** Arguments are evaluated on demand (ЕСЛИ evaluates one branch). */
  lazy?: boolean;
  call: (
    args: FormulaValue[],
    ctx: FormulaContext,
    nodes: Node[]
  ) => FormulaValue;
};

function monthsBetween(from: FormulaDate, to: FormulaDate): number {
  const [y1, m1, d1] = from.date.split("-").map(Number);
  const [y2, m2, d2] = to.date.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

const dateFn =
  (pick: (date: FormulaDate) => number): Fn["call"] =>
  ([value]) => {
    const date = toDate(value);
    return date ? pick(date) : null;
  };

const functions: Record<string, Fn> = {
  ЕСЛИ: {
    arity: [2, 3],
    lazy: true,
    call: (_args, ctx, nodes) =>
      toBool(evaluate(nodes[0], ctx))
        ? evaluate(nodes[1], ctx)
        : nodes[2]
          ? evaluate(nodes[2], ctx)
          : null,
  },
  И: { arity: [1, Infinity], call: (args) => flatten(args).every(toBool) },
  ИЛИ: { arity: [1, Infinity], call: (args) => flatten(args).some(toBool) },
  НЕ: { arity: [1, 1], call: ([v]) => !toBool(v) },
  ЕПУСТО: { arity: [1, 1], call: ([v]) => isEmpty(v) },
  СУММ: {
    arity: [1, Infinity],
    call: (args) => numbersOf(args).reduce((a, b) => a + b, 0),
  },
  СРЗНАЧ: {
    arity: [1, Infinity],
    call: (args) => {
      const numbers = numbersOf(args);
      if (!numbers.length) {
        throw new FormulaError("#ДЕЛ/0! нет чисел для среднего");
      }
      return numbers.reduce((a, b) => a + b, 0) / numbers.length;
    },
  },
  МИН: {
    arity: [1, Infinity],
    call: (args) => extreme(args, Math.min),
  },
  МАКС: {
    arity: [1, Infinity],
    call: (args) => extreme(args, Math.max),
  },
  СЧЕТ: {
    arity: [1, Infinity],
    call: (args) =>
      flatten(args).filter(
        (v) =>
          typeof v === "number" ||
          (typeof v === "string" &&
            v.trim() !== "" &&
            !isNaN(Number(v.replace(",", "."))))
      ).length,
  },
  СЧЕТЗ: {
    arity: [1, Infinity],
    call: (args) => flatten(args).filter((v) => !isEmpty(v)).length,
  },
  ОКРУГЛ: {
    arity: [1, 2],
    call: ([v, d]) => round(toNumber(v), toNumber(d ?? 0), "round"),
  },
  ОКРУГЛВВЕРХ: {
    arity: [1, 2],
    call: ([v, d]) => round(toNumber(v), toNumber(d ?? 0), "up"),
  },
  ОКРУГЛВНИЗ: {
    arity: [1, 2],
    call: ([v, d]) => round(toNumber(v), toNumber(d ?? 0), "down"),
  },
  ЦЕЛОЕ: { arity: [1, 1], call: ([v]) => Math.floor(toNumber(v)) },
  ABS: { arity: [1, 1], call: ([v]) => Math.abs(toNumber(v)) },
  ОСТАТ: {
    arity: [2, 2],
    call: ([a, b]) => {
      const divisor = toNumber(b);
      if (divisor === 0) {
        throw new FormulaError("#ДЕЛ/0! деление на ноль");
      }
      const n = toNumber(a);
      return n - divisor * Math.floor(n / divisor);
    },
  },
  СЦЕП: {
    arity: [1, Infinity],
    call: (args) => flatten(args).map(toText).join(""),
  },
  СЦЕПИТЬ: {
    arity: [1, Infinity],
    call: (args) => flatten(args).map(toText).join(""),
  },
  ДЛСТР: { arity: [1, 1], call: ([v]) => toText(v).length },
  ПРОПИСН: { arity: [1, 1], call: ([v]) => toText(v).toUpperCase() },
  СТРОЧН: { arity: [1, 1], call: ([v]) => toText(v).toLowerCase() },
  СЖПРОБЕЛЫ: {
    arity: [1, 1],
    call: ([v]) => toText(v).trim().replace(/\s+/g, " "),
  },
  ЛЕВСИМВ: {
    arity: [1, 2],
    call: ([v, n]) => toText(v).slice(0, Math.max(0, toNumber(n ?? 1))),
  },
  ПРАВСИМВ: {
    arity: [1, 2],
    call: ([v, n]) => {
      const count = Math.max(0, toNumber(n ?? 1));
      const text = toText(v);
      return count ? text.slice(-count) : "";
    },
  },
  ПОДСТАВИТЬ: {
    arity: [3, 3],
    call: ([v, from, to]) => {
      const search = toText(from);
      return search ? toText(v).split(search).join(toText(to)) : toText(v);
    },
  },
  СОДЕРЖИТ: {
    arity: [2, 2],
    call: ([where, what]) => {
      const needle = toText(what).toLowerCase();
      if (Array.isArray(where)) {
        return flatten(where).some((v) => toText(v).toLowerCase() === needle);
      }
      return toText(where).toLowerCase().includes(needle);
    },
  },
  СЕГОДНЯ: { arity: [0, 0], call: (_args, ctx) => ({ date: ctx.today }) },
  ДАТА: {
    arity: [3, 3],
    call: ([y, m, d]) => makeDate(toNumber(y), toNumber(m), toNumber(d)),
  },
  ГОД: { arity: [1, 1], call: dateFn((d) => +d.date.slice(0, 4)) },
  МЕСЯЦ: { arity: [1, 1], call: dateFn((d) => +d.date.slice(5, 7)) },
  ДЕНЬ: { arity: [1, 1], call: dateFn((d) => +d.date.slice(8, 10)) },
  ДНИ: {
    arity: [2, 2],
    call: ([end, start]) => {
      const to = toDate(end);
      const from = toDate(start);
      return to && from ? dateToDays(to) - dateToDays(from) : null;
    },
  },
  РАЗНДАТ: {
    arity: [3, 3],
    call: ([start, end, unit]) => {
      const from = toDate(start);
      const to = toDate(end);
      if (!from || !to) {
        return null;
      }
      if (from.date > to.date) {
        throw new FormulaError("РАЗНДАТ: начальная дата позже конечной");
      }
      const u = toText(unit).toLowerCase();
      if (u === "d" || u === "д") {
        return dateToDays(to) - dateToDays(from);
      }
      if (u === "m" || u === "м") {
        return monthsBetween(from, to);
      }
      if (u === "y" || u === "г") {
        return Math.floor(monthsBetween(from, to) / 12);
      }
      throw new FormulaError("РАЗНДАТ: единица «д», «м» или «г»");
    },
  },
  ДНЕЙ_ДО: {
    arity: [1, 1],
    call: ([value], ctx) => {
      const date = toDate(value);
      return date ? (daysUntilAnniversary(date.date, ctx.today) ?? null) : null;
    },
  },
};

function extreme(
  args: FormulaValue[],
  pick: (...values: number[]) => number
): FormulaValue {
  const values = flatten(args).filter((v) => !isEmpty(v));
  if (!values.length) {
    return null;
  }
  if (values.every(isDate)) {
    return daysToDate(pick(...values.map((v) => dateToDays(v as FormulaDate))));
  }
  return pick(...values.map(toNumber));
}

const emptyIn = ["+", "-", "*", "/", "^", "<", ">", "<=", ">="];

function binaryOp(op: string, a: FormulaValue, b: FormulaValue): FormulaValue {
  switch (op) {
    case "+":
    case "-": {
      if (isDate(a) || isDate(b)) {
        if (op === "-" && isDate(a) && isDate(b)) {
          return dateToDays(a) - dateToDays(b);
        }
        if (isDate(a)) {
          return daysToDate(
            dateToDays(a) + (op === "+" ? 1 : -1) * toNumber(b)
          );
        }
        if (op === "+") {
          return daysToDate(toNumber(a) + dateToDays(b as FormulaDate));
        }
      }
      return op === "+" ? toNumber(a) + toNumber(b) : toNumber(a) - toNumber(b);
    }
    case "*":
      return toNumber(a) * toNumber(b);
    case "/": {
      const divisor = toNumber(b);
      if (divisor === 0) {
        throw new FormulaError("#ДЕЛ/0! деление на ноль");
      }
      return toNumber(a) / divisor;
    }
    case "^":
      return Math.pow(toNumber(a), toNumber(b));
    case "&":
      return toText(a) + toText(b);
    case "=":
      return compare(a, b) === 0;
    case "<>":
      return compare(a, b) !== 0;
    case "<":
      return compare(a, b) < 0;
    case ">":
      return compare(a, b) > 0;
    case "<=":
      return compare(a, b) <= 0;
    case ">=":
      return compare(a, b) >= 0;
    default:
      throw new FormulaError(`неизвестная операция «${op}»`);
  }
}

function evaluate(node: Node, ctx: FormulaContext): FormulaValue {
  switch (node.kind) {
    case "value":
      return node.value;
    case "ref":
      return ctx.ref(node.name);
    case "negate": {
      const value = evaluate(node.arg, ctx);
      return value === null ? null : -toNumber(value);
    }
    case "binary": {
      const left = evaluate(node.left, ctx);
      const right = evaluate(node.right, ctx);
      // Arithmetic and ordering with an empty cell give an empty cell, so a
      // date column stays a date column and an empty date is not "soon".
      // СУММ() treats empty cells as zero; = and <> compare them as "".
      if (emptyIn.includes(node.op) && (left === null || right === null)) {
        return null;
      }
      return binaryOp(node.op, left, right);
    }
    case "call": {
      const fn = functions[node.name];
      const args = fn.lazy ? [] : node.args.map((arg) => evaluate(arg, ctx));
      return fn.call(args, ctx, node.args);
    }
  }
}

/**
 * Evaluates a formula.
 *
 * @param source the formula.
 * @param ctx column values of the row and today's date.
 * @returns the result.
 * @throws FormulaError for invalid formulas and calculation errors.
 */
export function evaluateFormula(
  source: string,
  ctx: FormulaContext
): FormulaValue {
  const result = evaluate(compile(source), ctx);
  if (typeof result === "number" && !Number.isFinite(result)) {
    throw new FormulaError("#ЧИСЛО! результат слишком большой");
  }
  return result;
}

export const formulaValue = {
  isDate,
  toText,
  parseDate,
};

/** Names of the functions, for the help in the column menu. */
export const formulaFunctions = Object.keys(functions);
