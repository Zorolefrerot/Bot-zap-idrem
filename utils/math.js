"use strict";

/**
 * utils/math.js
 * ---------------------------------------------------------------------------
 * Calculatrice SÉCURISÉE pour /calc et /mathgame.
 *
 * Aucun `eval()` ni `new Function()` : l'expression est tokenisée, convertie en
 * notation polonaise inverse (shunting-yard de Dijkstra) puis évaluée. Une
 * entrée malveillante ne peut donc rien exécuter.
 *
 * Supporte : + - * / % ^, parenthèses, moins unaire, multiplication implicite
 * (2pi, 3(4+1)), virgule décimale française (3,5) quand aucune fonction n'est
 * appelée, constantes (pi, e, tau, phi) et
 * fonctions (sqrt, abs, round, floor, ceil, trigonométrie, logarithmes, min,
 * max, pow, hypot, atan2, log avec base optionnelle).
 * ---------------------------------------------------------------------------
 */

const CONSTANTS = {
  pi: Math.PI,
  "π": Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
  phi: (1 + Math.sqrt(5)) / 2
};

const FUNCTIONS = {
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  trunc: Math.trunc,
  sign: Math.sign,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  log10: Math.log10,
  log2: Math.log2,
  ln: Math.log,
  exp: Math.exp,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  hypot: Math.hypot,
  atan2: Math.atan2,
  /** log(x) = base 10 ; log(x, b) = base b. */
  log: (x, b) => (b === undefined ? Math.log10(x) : Math.log(x) / Math.log(b))
};

/** [arguments minimum, arguments maximum] par fonction. */
const ARITY = {
  min: [1, Infinity],
  max: [1, Infinity],
  hypot: [1, Infinity],
  pow: [2, 2],
  atan2: [2, 2],
  log: [1, 2]
};

/** Opérateurs binaires + le moins unaire « u ». */
const OPERATORS = {
  "+": { prec: 2, assoc: "L", arity: 2, fn: (a, b) => a + b },
  "-": { prec: 2, assoc: "L", arity: 2, fn: (a, b) => a - b },
  "*": { prec: 3, assoc: "L", arity: 2, fn: (a, b) => a * b },
  "/": { prec: 3, assoc: "L", arity: 2, fn: (a, b) => a / b },
  "%": { prec: 3, assoc: "L", arity: 2, fn: (a, b) => a % b },
  "^": { prec: 4, assoc: "R", arity: 2, fn: (a, b) => a ** b },
  u: { prec: 5, assoc: "R", arity: 1, fn: (a) => -a }
};

const MAX_LENGTH = 240;
const MAX_TOKENS = 150;

class CalcError extends Error {
  constructor(message) {
    super(message);
    this.name = "CalcError";
  }
}

/**
 * Nettoyage de l'expression : espaces supprimés, symboles exotiques remplacés
 * par leurs équivalents ASCII.
 *
 * La virgule décimale française N'EST PAS convertie ici : elle serait confondue
 * avec le séparateur d'arguments de min(3,1). C'est mergeDecimalCommas() qui
 * tranche, une fois que l'on sait si l'expression contient une fonction.
 */
function normalize(input) {
  return String(input ?? "")
    .replace(/\s+/g, "")
    .replace(/×/g, "*")
    .replace(/[÷:]/g, "/")
    .replace(/[−–]/g, "-")
    .replace(/\*\*/g, "^");
}

function tokenize(input) {
  const tokens = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/[\d.]/.test(ch)) {
      let num = "";
      while (i < input.length && /[\d.]/.test(input[i])) num += input[i++];
      if ((num.match(/\./g) || []).length > 1) throw new CalcError("Nombre mal formé.");
      const value = Number(num);
      if (!Number.isFinite(value)) throw new CalcError("Nombre invalide.");
      tokens.push({ type: "number", value, text: num });
      continue;
    }

    // Les identifiants peuvent contenir des chiffres : atan2, log10, log2…
    if (/[a-zπ]/i.test(ch)) {
      let word = "";
      while (i < input.length && /[a-z0-9π]/i.test(input[i])) word += input[i++];
      const key = word.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(FUNCTIONS, key)) tokens.push({ type: "function", value: key });
      else if (Object.prototype.hasOwnProperty.call(CONSTANTS, key)) tokens.push({ type: "number", value: CONSTANTS[key] });
      else throw new CalcError(`Nom inconnu : « ${word} ».`);
      continue;
    }

    if (ch === "(") { tokens.push({ type: "lparen" }); i += 1; continue; }
    if (ch === ")") { tokens.push({ type: "rparen" }); i += 1; continue; }
    if (ch === ",") { tokens.push({ type: "comma" }); i += 1; continue; }
    if ("+-*/%^".includes(ch)) { tokens.push({ type: "operator", value: ch }); i += 1; continue; }

    throw new CalcError(`Caractère non supporté : « ${ch} ».`);
  }

  return tokens;
}

/**
 * Convertit « 3,5 » en 3.5 lorsque l'expression ne contient aucune fonction :
 * dans ce cas la virgule ne peut pas être un séparateur d'arguments.
 */
function mergeDecimalCommas(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const current = tokens[i];
    const previous = out[out.length - 1];
    const next = tokens[i + 1];
    if (
      current.type === "comma" &&
      previous && previous.type === "number" &&
      next && next.type === "number"
    ) {
      const decimals = next.text || String(next.value);
      out[out.length - 1] = {
        type: "number",
        value: Number(`${previous.text || previous.value}.${decimals}`),
        text: `${previous.text || previous.value}.${decimals}`
      };
      i += 1; // le nombre suivant a été absorbé
      continue;
    }
    out.push(current);
  }
  return out;
}

/** Insère les multiplications implicites : 2(3) → 2*(3), 2pi → 2*pi. */
function expandImplicit(tokens) {
  const out = [];
  for (const token of tokens) {
    const previous = out[out.length - 1];
    if (previous) {
      const prevEndsValue = previous.type === "number" || previous.type === "rparen";
      const curStartsValue = token.type === "number" || token.type === "lparen" || token.type === "function";
      if (prevEndsValue && curStartsValue) out.push({ type: "operator", value: "*" });
    }
    out.push(token);
  }
  return out;
}

/**
 * Marque le signe moins unaire (début d'expression, ou après un opérateur,
 * une parenthèse ouvrante, une virgule ou une fonction) et supprime le signe
 * plus unaire.
 */
function resolveUnary(tokens) {
  const out = [];
  for (const token of tokens) {
    const previous = out[out.length - 1];
    const unaryContext =
      !previous ||
      previous.type === "operator" ||
      previous.type === "lparen" ||
      previous.type === "comma" ||
      previous.type === "function";

    if (token.type === "operator" && unaryContext && (token.value === "-" || token.value === "+")) {
      if (token.value === "-") out.push({ type: "operator", value: "u", unary: true });
      // « + » unaire : aucun effet, on l'ignore.
      continue;
    }
    out.push(token);
  }
  return out;
}

function toRpn(tokens) {
  const output = [];
  const stack = [];

  for (const token of tokens) {
    switch (token.type) {
      case "number":
        output.push(token);
        break;

      case "function":
        stack.push({ type: "function", value: token.value, args: 1 });
        break;

      case "comma": {
        let foundParen = false;
        while (stack.length) {
          const top = stack[stack.length - 1];
          if (top.type === "lparen") {
            foundParen = true;
            break;
          }
          output.push(stack.pop());
        }
        if (!foundParen) throw new CalcError("Virgule en dehors d'un appel de fonction.");
        const frame = stack[stack.length - 2];
        if (frame && frame.type === "function") frame.args += 1;
        break;
      }

      case "operator": {
        const op = OPERATORS[token.value];
        if (!op) throw new CalcError(`Opérateur inconnu : « ${token.value} ».`);
        while (stack.length) {
          const top = stack[stack.length - 1];
          if (top.type !== "operator") break;
          const topOp = OPERATORS[top.value];
          const shouldPop =
            op.assoc === "L" ? op.prec <= topOp.prec : op.prec < topOp.prec;
          if (!shouldPop) break;
          output.push(stack.pop());
        }
        stack.push({ type: "operator", value: token.value });
        break;
      }

      case "lparen":
        stack.push(token);
        break;

      case "rparen": {
        let foundParen = false;
        while (stack.length) {
          const top = stack.pop();
          if (top.type === "lparen") {
            foundParen = true;
            break;
          }
          output.push(top);
        }
        if (!foundParen) throw new CalcError("Parenthèses non équilibrées.");
        if (stack.length && stack[stack.length - 1].type === "function") {
          output.push(stack.pop());
        }
        break;
      }

      default:
        throw new CalcError("Jeton inattendu.");
    }
  }

  while (stack.length) {
    const top = stack.pop();
    if (top.type === "lparen") throw new CalcError("Parenthèses non équilibrées.");
    output.push(top);
  }

  return output;
}

function evalRpn(rpn) {
  const stack = [];

  for (const token of rpn) {
    if (token.type === "number") {
      stack.push(token.value);
      continue;
    }

    if (token.type === "function") {
      const [minArgs, maxArgs] = ARITY[token.value] || [1, 1];
      const declared = Math.max(1, Number(token.args) || 1);
      const arity = Math.min(Math.max(declared, minArgs), maxArgs === Infinity ? stack.length : maxArgs);
      if (stack.length < arity) throw new CalcError(`Arguments manquants pour ${token.value}().`);
      const args = stack.splice(stack.length - arity, arity);
      const result = FUNCTIONS[token.value](...args);
      if (typeof result !== "number" || !Number.isFinite(result)) {
        throw new CalcError(`Résultat indéfini pour ${token.value}().`);
      }
      stack.push(result);
      continue;
    }

    if (token.type === "operator") {
      const op = OPERATORS[token.value];
      if (!op) throw new CalcError("Opérateur inconnu.");
      if (op.arity === 1) {
        if (stack.length < 1) throw new CalcError("Expression incomplète.");
        stack.push(op.fn(stack.pop()));
        continue;
      }
      if (stack.length < 2) throw new CalcError("Expression incomplète.");
      const b = stack.pop();
      const a = stack.pop();
      if (token.value === "/" && b === 0) throw new CalcError("Division par zéro.");
      if (token.value === "%" && b === 0) throw new CalcError("Modulo par zéro.");
      const result = op.fn(a, b);
      if (!Number.isFinite(result)) throw new CalcError("Résultat hors limites (trop grand ou indéfini).");
      stack.push(result);
      continue;
    }
  }

  if (stack.length !== 1) throw new CalcError("Expression incomplète ou mal formée.");
  return stack[0];
}

/** Arrondi d'affichage : évite 0.30000000000000004 et les exponentielles illisibles. */
function format(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n) && Math.abs(n) < 1e15) {
    return String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ").replace(/^/, n < 0 ? "-" : "");
  }
  const rounded = Number(n.toPrecision(12));
  if (Math.abs(rounded) >= 1e15 || (rounded !== 0 && Math.abs(rounded) < 1e-6)) {
    return rounded.toExponential(6).replace(".", ",");
  }
  return String(rounded).replace(".", ",");
}

/**
 * Évalue une expression mathématique.
 *
 * @param {string} expression
 * @returns {{ ok: boolean, value?: number, text?: string, error?: string }}
 */
function calculate(expression) {
  const raw = normalize(expression);
  if (!raw) return { ok: false, error: "Expression vide." };
  if (raw.length > MAX_LENGTH) return { ok: false, error: `Expression trop longue (max ${MAX_LENGTH} caractères).` };

  try {
    const lexed = tokenize(raw);
    const hasFunction = lexed.some((t) => t.type === "function");
    const tokens = resolveUnary(expandImplicit(hasFunction ? lexed : mergeDecimalCommas(lexed)));
    if (!tokens.length) return { ok: false, error: "Expression vide." };
    if (tokens.length > MAX_TOKENS) return { ok: false, error: "Expression trop complexe." };
    const value = evalRpn(toRpn(tokens));
    return { ok: true, value, text: format(value) };
  } catch (err) {
    return { ok: false, error: err instanceof CalcError ? err.message : "Expression invalide." };
  }
}

/** Noms des fonctions disponibles (aide de /calc). */
function functionNames() {
  return Object.keys(FUNCTIONS).sort();
}

/** Noms des constantes disponibles. */
function constantNames() {
  return Object.keys(CONSTANTS).filter((k) => k !== "π");
}

module.exports = { calculate, format, normalize, functionNames, constantNames, CalcError, CONSTANTS };
