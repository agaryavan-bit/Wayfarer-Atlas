export type FractionOperator = '+' | '-' | '*' | '/';

export interface FractionInputParts {
  whole: string;
  numerator: string;
  denominator: string;
}

export interface ExactFraction {
  num: bigint; // signed numerator
  den: bigint; // always > 0n
}

export interface MixedParts {
  negative: boolean;
  whole: bigint;
  remNum: bigint;
  den: bigint;
}

export interface SolutionStep {
  title: string;
  expression: string;
  detail: string;
}

export interface OperationResult {
  a: ExactFraction;
  b: ExactFraction;
  rawResult: ExactFraction;
  reduced: ExactFraction;
  mixed: MixedParts;
  decimal: string;
  percentage: string;
  gcdUsed: bigint;
  steps: SolutionStep[];
}

export interface CompareResult {
  a: ExactFraction;
  b: ExactFraction;
  relation: '<' | '=' | '>';
  lcd: bigint;
  scaledANum: bigint;
  scaledBNum: bigint;
  difference: ExactFraction;
  steps: SolutionStep[];
}

export function absBigInt(n: bigint): bigint {
  return n < 0n ? -n : n;
}

export function gcdBigInt(a: bigint, b: bigint): bigint {
  let x = absBigInt(a);
  let y = absBigInt(b);
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0n ? 1n : x;
}

export function lcmBigInt(a: bigint, b: bigint): bigint {
  const x = absBigInt(a);
  const y = absBigInt(b);
  if (x === 0n || y === 0n) return 0n;
  return (x / gcdBigInt(x, y)) * y;
}

export function normalizeFraction(num: bigint, den: bigint): ExactFraction {
  if (den === 0n) {
    throw new Error('Denominator cannot be zero.');
  }
  if (num === 0n) {
    return { num: 0n, den: 1n };
  }
  const sign = den < 0n ? -1n : 1n;
  const sNum = num * sign;
  const sDen = den * sign;
  const g = gcdBigInt(sNum, sDen);
  return { num: sNum / g, den: sDen / g };
}

export function toMixedParts(frac: ExactFraction): MixedParts {
  const reduced = normalizeFraction(frac.num, frac.den);
  const negative = reduced.num < 0n;
  const absNum = absBigInt(reduced.num);
  const whole = absNum / reduced.den;
  const remNum = absNum % reduced.den;
  return {
    negative,
    whole,
    remNum,
    den: reduced.den,
  };
}

export function formatImproper(frac: ExactFraction): string {
  if (frac.den === 1n) return frac.num.toString();
  return `${frac.num.toString()}/${frac.den.toString()}`;
}

export function formatMixed(frac: ExactFraction): string {
  const m = toMixedParts(frac);
  const sign = m.negative ? '-' : '';
  if (m.remNum === 0n) return `${sign}${m.whole.toString()}`;
  if (m.whole === 0n) return `${sign}${m.remNum.toString()}/${m.den.toString()}`;
  return `${sign}${m.whole.toString()} ${m.remNum.toString()}/${m.den.toString()}`;
}

export function fractionToNumber(frac: ExactFraction): number {
  if (frac.den === 0n) return Number.NaN;
  // Use BigInt scaled division for accurate decimal conversion up to 8 places
  const negative = frac.num < 0n;
  const absNum = absBigInt(frac.num);
  const scaled = (absNum * 100000000n) / frac.den;
  const value = Number(scaled) / 1e8;
  return negative ? -value : value;
}

export function formatDecimal(frac: ExactFraction, maxPlaces = 6): string {
  if (frac.den === 0n) return 'Undefined';
  const negative = frac.num < 0n;
  const absNum = absBigInt(frac.num);
  const intPart = absNum / frac.den;
  let rem = absNum % frac.den;
  if (rem === 0n) {
    return `${negative && intPart > 0n ? '-' : ''}${intPart.toString()}`;
  }

  let decimals = '';
  for (let i = 0; i < maxPlaces && rem !== 0n; i++) {
    rem *= 10n;
    const digit = rem / frac.den;
    decimals += digit.toString();
    rem = rem % frac.den;
  }
  const trimmed = decimals.replace(/0+$/, '');
  const prefix = negative ? '-' : '';
  const suffix = rem !== 0n ? '…' : '';
  return `${prefix}${intPart.toString()}${trimmed ? `.${trimmed}` : ''}${suffix}`;
}

export function formatPercentage(frac: ExactFraction): string {
  const pctFrac: ExactFraction = { num: frac.num * 100n, den: frac.den };
  return `${formatDecimal(pctFrac, 3)}%`;
}

export function parseFractionParts(
  parts: FractionInputParts,
  label: string
): { value?: ExactFraction; error?: string; hadMixed?: boolean } {
  const wStr = parts.whole.trim();
  const nStr = parts.numerator.trim();
  const dStr = parts.denominator.trim();

  if (!wStr && !nStr) {
    return { error: `Enter a value for ${label}.` };
  }

  const intRegex = /^-?\d+$/;

  if (wStr && !intRegex.test(wStr)) {
    return { error: `Whole number for ${label} must be an integer.` };
  }
  if (nStr && !intRegex.test(nStr)) {
    return { error: `Numerator for ${label} must be an integer.` };
  }
  if (dStr && !intRegex.test(dStr)) {
    return { error: `Denominator for ${label} must be a non-zero integer.` };
  }

  const whole = wStr ? BigInt(wStr) : 0n;
  const num = nStr ? BigInt(nStr) : 0n;
  const den = dStr ? BigInt(dStr) : 1n;

  if (den === 0n) {
    return { error: `Denominator for ${label} cannot be 0.` };
  }

  if (wStr && nStr) {
    // Mixed number convention: -2 1/3 = -(2 + 1/3) = -7/3
    const isNeg = wStr.startsWith('-') || whole < 0n;
    const absWhole = absBigInt(whole);
    const absNum = absBigInt(num);
    const absDen = absBigInt(den);
    const totalNum = absWhole * absDen + absNum;
    const sign = (isNeg ? -1n : 1n) * (den < 0n ? -1n : 1n) * (num < 0n && !isNeg ? -1n : 1n);
    return {
      value: { num: sign * totalNum, den: absDen },
      hadMixed: whole !== 0n && num !== 0n,
    };
  }

  if (wStr && !nStr) {
    return { value: { num: whole, den: 1n }, hadMixed: false };
  }

  // Only numerator & denominator
  const sign = den < 0n ? -1n : 1n;
  return {
    value: { num: num * sign, den: absBigInt(den) },
    hadMixed: false,
  };
}

export function operatorSymbol(op: FractionOperator): string {
  switch (op) {
    case '+':
      return '+';
    case '-':
      return '−';
    case '*':
      return '×';
    case '/':
      return '÷';
  }
}

export function computeFractionOperation(
  aRaw: ExactFraction,
  bRaw: ExactFraction,
  op: FractionOperator,
  aHadMixed = false,
  bHadMixed = false
): { result?: OperationResult; error?: string } {
  if (op === '/' && bRaw.num === 0n) {
    return { error: 'Cannot divide by zero (Fraction B equals 0).' };
  }

  const steps: SolutionStep[] = [];
  const sym = operatorSymbol(op);

  if (aHadMixed || bHadMixed) {
    steps.push({
      title: 'Convert mixed numbers to improper fractions',
      expression: `${formatImproper(aRaw)} ${sym} ${formatImproper(bRaw)}`,
      detail: 'Multiply each whole part by its denominator and add the numerator.',
    });
  }

  let rawResult: ExactFraction;

  if (op === '+' || op === '-') {
    const lcd = lcmBigInt(aRaw.den, bRaw.den);
    const multA = lcd / aRaw.den;
    const multB = lcd / bRaw.den;
    const scaledA = aRaw.num * multA;
    const scaledB = bRaw.num * multB;

    if (aRaw.den !== bRaw.den) {
      steps.push({
        title: `Find the Least Common Denominator (LCD = ${lcd.toString()})`,
        expression: `${scaledA.toString()}/${lcd.toString()} ${sym} ${scaledB.toString()}/${lcd.toString()}`,
        detail: `Scale the first fraction by ${multA.toString()} and the second by ${multB.toString()}.`,
      });
    }

    const combinedNum = op === '+' ? scaledA + scaledB : scaledA - scaledB;
    rawResult = { num: combinedNum, den: lcd };
    steps.push({
      title: op === '+' ? 'Add the numerators' : 'Subtract the numerators',
      expression: `(${scaledA.toString()} ${sym} ${scaledB.toString()}) / ${lcd.toString()} = ${combinedNum.toString()}/${lcd.toString()}`,
      detail: 'Keep the common denominator unchanged.',
    });
  } else if (op === '*') {
    const prodNum = aRaw.num * bRaw.num;
    const prodDen = aRaw.den * bRaw.den;
    rawResult = { num: prodNum, den: prodDen };
    steps.push({
      title: 'Multiply numerators and denominators directly',
      expression: `(${aRaw.num.toString()} × ${bRaw.num.toString()}) / (${aRaw.den.toString()} × ${bRaw.den.toString()}) = ${prodNum.toString()}/${prodDen.toString()}`,
      detail: 'Multiply top by top and bottom by bottom.',
    });
  } else {
    // Division: multiply by reciprocal
    const recipSign = bRaw.num < 0n ? -1n : 1n;
    const recipNum = bRaw.den * recipSign;
    const recipDen = absBigInt(bRaw.num);
    steps.push({
      title: 'Multiply by the reciprocal of the second fraction',
      expression: `${formatImproper(aRaw)} × ${recipNum.toString()}/${recipDen.toString()}`,
      detail: 'Flip the numerator and denominator of the divisor.',
    });
    const prodNum = aRaw.num * recipNum;
    const prodDen = aRaw.den * recipDen;
    rawResult = { num: prodNum, den: prodDen };
    steps.push({
      title: 'Multiply across',
      expression: `${prodNum.toString()}/${prodDen.toString()}`,
      detail: 'Compute the product of the numerators and denominators.',
    });
  }

  const gcdUsed = rawResult.num === 0n ? 1n : gcdBigInt(rawResult.num, rawResult.den);
  const reduced = normalizeFraction(rawResult.num, rawResult.den);

  if (gcdUsed > 1n) {
    steps.push({
      title: `Simplify by dividing by GCD (${gcdUsed.toString()})`,
      expression: `${formatImproper(rawResult)} → ${formatImproper(reduced)}`,
      detail: `Divide both numerator and denominator by ${gcdUsed.toString()} to reach lowest terms.`,
    });
  } else {
    steps.push({
      title: 'Fraction is already in lowest terms',
      expression: formatImproper(reduced),
      detail: 'Greatest common divisor is 1, so no further reduction is needed.',
    });
  }

  const mixed = toMixedParts(reduced);
  if (mixed.whole > 0n && mixed.remNum > 0n) {
    steps.push({
      title: 'Express as a mixed number',
      expression: `${formatImproper(reduced)} = ${formatMixed(reduced)}`,
      detail: `${absBigInt(reduced.num).toString()} ÷ ${reduced.den.toString()} = ${mixed.whole.toString()} remainder ${mixed.remNum.toString()}.`,
    });
  }

  return {
    result: {
      a: aRaw,
      b: bRaw,
      rawResult,
      reduced,
      mixed,
      decimal: formatDecimal(reduced),
      percentage: formatPercentage(reduced),
      gcdUsed,
      steps,
    },
  };
}

export function simplifySingleFraction(raw: ExactFraction): {
  reduced: ExactFraction;
  mixed: MixedParts;
  gcdUsed: bigint;
  decimal: string;
  percentage: string;
  steps: SolutionStep[];
} {
  const gcdUsed = raw.num === 0n ? 1n : gcdBigInt(raw.num, raw.den);
  const reduced = normalizeFraction(raw.num, raw.den);
  const mixed = toMixedParts(reduced);
  const steps: SolutionStep[] = [];

  if (gcdUsed > 1n) {
    steps.push({
      title: `Find Greatest Common Divisor (GCD = ${gcdUsed.toString()})`,
      expression: `gcd(${absBigInt(raw.num).toString()}, ${raw.den.toString()}) = ${gcdUsed.toString()}`,
      detail: `The largest integer dividing both ${absBigInt(raw.num).toString()} and ${raw.den.toString()} evenly.`,
    });
    steps.push({
      title: 'Divide numerator and denominator by GCD',
      expression: `${raw.num.toString()}/${raw.den.toString()} = ${formatImproper(reduced)}`,
      detail: 'This yields the exact simplified fraction in lowest terms.',
    });
  } else {
    steps.push({
      title: 'Already in simplest form',
      expression: formatImproper(reduced),
      detail: 'Numerator and denominator share no common factor greater than 1.',
    });
  }

  if (mixed.whole > 0n && mixed.remNum > 0n) {
    steps.push({
      title: 'Convert improper fraction to mixed number',
      expression: `${formatImproper(reduced)} = ${formatMixed(reduced)}`,
      detail: `Extract ${mixed.whole.toString()} whole unit${mixed.whole === 1n ? '' : 's'} with ${mixed.remNum.toString()}/${mixed.den.toString()} remaining.`,
    });
  }

  return {
    reduced,
    mixed,
    gcdUsed,
    decimal: formatDecimal(reduced),
    percentage: formatPercentage(reduced),
    steps,
  };
}

export function decimalToFraction(input: string): {
  raw?: ExactFraction;
  reduced?: ExactFraction;
  mixed?: MixedParts;
  gcdUsed?: bigint;
  steps?: SolutionStep[];
  error?: string;
} {
  const trimmed = input.trim();
  if (!trimmed) return { error: 'Enter a decimal number such as 0.375 or 2.75.' };
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(trimmed)) {
    return { error: 'Please enter a valid decimal number (e.g. 0.75, -1.25, or 3.125).' };
  }

  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPartRaw, decPartRaw = ''] = unsigned.split('.');
  const intPart = intPartRaw || '0';
  const decPart = decPartRaw.slice(0, 12); // bound precision to 12 places

  const scale = 10n ** BigInt(decPart.length);
  const rawNumAbs = BigInt(intPart + (decPart || ''));
  const rawNum = negative ? -rawNumAbs : rawNumAbs;
  const raw: ExactFraction = { num: rawNum, den: scale };
  const gcdUsed = rawNum === 0n ? 1n : gcdBigInt(rawNum, scale);
  const reduced = normalizeFraction(rawNum, scale);
  const mixed = toMixedParts(reduced);

  const steps: SolutionStep[] = [
    {
      title: 'Write decimal over a power of 10',
      expression: `${trimmed} = ${rawNum.toString()}/${scale.toString()}`,
      detail:
        decPart.length === 0
          ? 'Whole integers have denominator 1.'
          : `${decPart.length} decimal place${decPart.length === 1 ? '' : 's'} corresponds to a denominator of 10^${decPart.length} (${scale.toString()}).`,
    },
  ];

  if (gcdUsed > 1n) {
    steps.push({
      title: `Reduce by GCD (${gcdUsed.toString()})`,
      expression: `${rawNum.toString()}/${scale.toString()} → ${formatImproper(reduced)}`,
      detail: `Divide numerator and denominator by ${gcdUsed.toString()}.`,
    });
  }

  if (mixed.whole > 0n && mixed.remNum > 0n) {
    steps.push({
      title: 'Write as a mixed number',
      expression: formatMixed(reduced),
      detail: `Whole part ${mixed.whole.toString()} and fractional remainder ${mixed.remNum.toString()}/${mixed.den.toString()}.`,
    });
  }

  return { raw, reduced, mixed, gcdUsed, steps };
}

export function compareFractions(aRaw: ExactFraction, bRaw: ExactFraction): CompareResult {
  const lcd = lcmBigInt(aRaw.den, bRaw.den);
  const scaledANum = aRaw.num * (lcd / aRaw.den);
  const scaledBNum = bRaw.num * (lcd / bRaw.den);

  let relation: '<' | '=' | '=' | '>' = '=';
  if (scaledANum < scaledBNum) relation = '<';
  else if (scaledANum > scaledBNum) relation = '>';

  const difference = normalizeFraction(absBigInt(scaledANum - scaledBNum), lcd);

  const steps: SolutionStep[] = [
    {
      title: `Convert both fractions to LCD (${lcd.toString()})`,
      expression: `${formatImproper(aRaw)} = ${scaledANum.toString()}/${lcd.toString()}  and  ${formatImproper(bRaw)} = ${scaledBNum.toString()}/${lcd.toString()}`,
      detail: 'Scaling to the same denominator lets you compare numerators directly.',
    },
    {
      title: 'Compare the scaled numerators',
      expression: `${scaledANum.toString()} ${relation} ${scaledBNum.toString()}  ⇒  ${formatImproper(aRaw)} ${relation} ${formatImproper(bRaw)}`,
      detail:
        relation === '='
          ? 'Both fractions represent the exact same value.'
          : `The exact difference between them is ${formatImproper(difference)} (${formatDecimal(difference)}).`,
    },
  ];

  return {
    a: aRaw,
    b: bRaw,
    relation,
    lcd,
    scaledANum,
    scaledBNum,
    difference,
    steps,
  };
}
