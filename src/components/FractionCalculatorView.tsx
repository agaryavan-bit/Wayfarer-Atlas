import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  Check,
  Copy,
  History,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  absBigInt,
  compareFractions,
  computeFractionOperation,
  decimalToFraction,
  formatDecimal,
  formatImproper,
  formatMixed,
  formatPercentage,
  fractionToNumber,
  operatorSymbol,
  parseFractionParts,
  simplifySingleFraction,
  type ExactFraction,
  type FractionInputParts,
  type FractionOperator,
} from '../utils/fractionMath';

type CalculatorMode = 'operate' | 'simplify' | 'decimal' | 'compare';

interface HistoryEntry {
  id: string;
  expression: string;
  resultText: string;
  decimalText: string;
  a: FractionInputParts;
  b: FractionInputParts;
  op: FractionOperator;
  timestamp: string;
}

const HISTORY_STORAGE_KEY = 'wayfarer_fraction_calc_history_v1';

const QUICK_PRESETS: Array<{
  label: string;
  a: FractionInputParts;
  b: FractionInputParts;
  op: FractionOperator;
}> = [
  {
    label: '3/4 + 2/3',
    a: { whole: '', numerator: '3', denominator: '4' },
    b: { whole: '', numerator: '2', denominator: '3' },
    op: '+',
  },
  {
    label: '2 1/2 × 1 1/3',
    a: { whole: '2', numerator: '1', denominator: '2' },
    b: { whole: '1', numerator: '1', denominator: '3' },
    op: '*',
  },
  {
    label: '5/6 ÷ 2/9',
    a: { whole: '', numerator: '5', denominator: '6' },
    b: { whole: '', numerator: '2', denominator: '9' },
    op: '/',
  },
  {
    label: '7/8 − 3/10',
    a: { whole: '', numerator: '7', denominator: '8' },
    b: { whole: '', numerator: '3', denominator: '10' },
    op: '-',
  },
];

function FractionVisualBar({
  fraction,
  label,
  accent = '#007AFF',
}: {
  fraction: ExactFraction;
  label: string;
  accent?: string;
}) {
  const numVal = fractionToNumber(fraction);
  const absVal = Math.abs(numVal);
  const wholeUnits = Math.floor(absVal);
  const remainder = absVal - wholeUnits;
  const denNumber = Number(fraction.den <= 24n ? fraction.den : 0n);
  const remNumerator =
    denNumber > 0 ? Number(absBigInt(fraction.num) % fraction.den) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-mono tabular-nums text-slate-500">
          {formatMixed(fraction)} · {formatDecimal(fraction, 4)}
        </span>
      </div>

      {denNumber > 0 && wholeUnits <= 3 ? (
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: wholeUnits }).map((_, wIdx) => (
            <div
              key={`whole-${wIdx}`}
              className="h-5 flex-1 min-w-[64px] max-w-[140px] rounded-lg overflow-hidden border border-white/80 shadow-inner"
              style={{ backgroundColor: accent }}
              title="1 whole"
            />
          ))}
          {(remNumerator > 0 || wholeUnits === 0) && (
            <div
              className="h-5 flex-1 min-w-[100px] rounded-lg overflow-hidden border border-white/80 bg-white/55 grid gap-px"
              style={{
                gridTemplateColumns: `repeat(${denNumber}, minmax(0, 1fr))`,
              }}
              title={`${remNumerator} of ${denNumber} equal parts`}
            >
              {Array.from({ length: denNumber }).map((_, segIdx) => (
                <div
                  key={`seg-${segIdx}`}
                  style={{
                    backgroundColor:
                      segIdx < remNumerator ? accent : 'rgba(15, 23, 42, 0.06)',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="h-4 w-full rounded-lg overflow-hidden bg-white/55 border border-white/80">
          <div
            className="h-full rounded-lg transition-all duration-200"
            style={{
              width: `${Math.min(100, Math.max(4, (absVal % 1 || (absVal > 0 ? 1 : 0)) * 100))}%`,
              backgroundColor: accent,
            }}
          />
        </div>
      )}
    </div>
  );
}

function StackedFractionInput({
  label,
  value,
  onChange,
  showWhole = true,
}: {
  label: string;
  value: FractionInputParts;
  onChange: (next: FractionInputParts) => void;
  showWhole?: boolean;
}) {
  return (
    <div className="liquid-glass-subtle rounded-[22px] p-4 flex flex-col items-center">
      <span className="text-xs font-semibold text-slate-600 mb-3">{label}</span>
      <div className="flex items-center gap-2.5">
        {showWhole && (
          <input
            type="text"
            inputMode="numeric"
            value={value.whole}
            onChange={(e) => onChange({ ...value, whole: e.target.value })}
            placeholder="0"
            aria-label={`${label} whole number`}
            className="w-14 h-12 text-center text-lg font-mono tabular-nums font-semibold liquid-glass-input rounded-2xl text-slate-950 placeholder:text-slate-400"
          />
        )}
        <div className="flex flex-col items-center gap-1.5">
          <input
            type="text"
            inputMode="numeric"
            value={value.numerator}
            onChange={(e) => onChange({ ...value, numerator: e.target.value })}
            placeholder="Num"
            aria-label={`${label} numerator`}
            className="w-24 h-11 text-center text-base font-mono tabular-nums font-semibold liquid-glass-input rounded-xl text-slate-950 placeholder:text-slate-400"
          />
          <div className="w-24 h-[2px] bg-slate-800/75 rounded-full" />
          <input
            type="text"
            inputMode="numeric"
            value={value.denominator}
            onChange={(e) => onChange({ ...value, denominator: e.target.value })}
            placeholder="Den"
            aria-label={`${label} denominator`}
            className="w-24 h-11 text-center text-base font-mono tabular-nums font-semibold liquid-glass-input rounded-xl text-slate-950 placeholder:text-slate-400"
          />
        </div>
      </div>
      <p className="mt-2.5 text-[11px] text-slate-500">
        {showWhole ? 'Whole (optional) + Num / Den' : 'Numerator / Denominator'}
      </p>
    </div>
  );
}

function StackedFractionDisplay({
  fraction,
  size = 'lg',
}: {
  fraction: ExactFraction;
  size?: 'md' | 'lg';
}) {
  const isNeg = fraction.num < 0n;
  const absNum = absBigInt(fraction.num);
  const textClass =
    size === 'lg'
      ? 'text-2xl sm:text-3xl font-mono tabular-nums font-semibold text-slate-950'
      : 'text-lg font-mono tabular-nums font-semibold text-slate-900';

  if (fraction.den === 1n) {
    return <span className={textClass}>{fraction.num.toString()}</span>;
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {isNeg && <span className={textClass}>−</span>}
      <span className="inline-flex flex-col items-center leading-none">
        <span className={`${textClass} pb-1`}>{absNum.toString()}</span>
        <span className="w-full min-w-[2.2rem] h-[2px] bg-slate-900/80 rounded-full" />
        <span className={`${textClass} pt-1`}>{fraction.den.toString()}</span>
      </span>
    </span>
  );
}

export function FractionCalculatorView() {
  const [mode, setMode] = useState<CalculatorMode>('operate');
  const [fracA, setFracA] = useState<FractionInputParts>({
    whole: '',
    numerator: '3',
    denominator: '4',
  });
  const [fracB, setFracB] = useState<FractionInputParts>({
    whole: '',
    numerator: '2',
    denominator: '3',
  });
  const [operator, setOperator] = useState<FractionOperator>('+');
  const [decimalInput, setDecimalInput] = useState('0.375');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 15)));
    } catch {
      // Ignore storage quota errors
    }
  }, [history]);

  // Live evaluation for Operate mode
  const operateEval = useMemo(() => {
    const parsedA = parseFractionParts(fracA, 'Fraction A');
    if (parsedA.error || !parsedA.value) return { error: parsedA.error || 'Invalid Fraction A' };
    const parsedB = parseFractionParts(fracB, 'Fraction B');
    if (parsedB.error || !parsedB.value) return { error: parsedB.error || 'Invalid Fraction B' };
    return computeFractionOperation(
      parsedA.value,
      parsedB.value,
      operator,
      parsedA.hadMixed,
      parsedB.hadMixed
    );
  }, [fracA, fracB, operator]);

  // Live evaluation for Simplify mode
  const simplifyEval = useMemo(() => {
    const parsedA = parseFractionParts(fracA, 'the fraction');
    if (parsedA.error || !parsedA.value) return { error: parsedA.error || 'Invalid fraction' };
    return { raw: parsedA.value, data: simplifySingleFraction(parsedA.value) };
  }, [fracA]);

  // Live evaluation for Decimal mode
  const decimalEval = useMemo(() => decimalToFraction(decimalInput), [decimalInput]);

  // Live evaluation for Compare mode
  const compareEval = useMemo(() => {
    const parsedA = parseFractionParts(fracA, 'Fraction A');
    if (parsedA.error || !parsedA.value) return { error: parsedA.error || 'Invalid Fraction A' };
    const parsedB = parseFractionParts(fracB, 'Fraction B');
    if (parsedB.error || !parsedB.value) return { error: parsedB.error || 'Invalid Fraction B' };
    return { data: compareFractions(parsedA.value, parsedB.value) };
  }, [fracA, fracB]);

  const handleSaveToHistory = () => {
    if (!operateEval.result) return;
    const res = operateEval.result;
    const expression = `${formatMixed(res.a)} ${operatorSymbol(operator)} ${formatMixed(res.b)}`;
    const resultText = formatMixed(res.reduced);
    const entry: HistoryEntry = {
      id: `calc-${Date.now()}`,
      expression,
      resultText,
      decimalText: res.decimal,
      a: { ...fracA },
      b: { ...fracB },
      op: operator,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setHistory((prev) => {
      if (prev[0]?.expression === entry.expression && prev[0]?.resultText === entry.resultText) {
        return prev;
      }
      return [entry, ...prev].slice(0, 15);
    });
  };

  const handleUseResultAsA = () => {
    if (!operateEval.result) return;
    const m = operateEval.result.mixed;
    if (m.remNum === 0n) {
      setFracA({
        whole: `${m.negative ? '-' : ''}${m.whole.toString()}`,
        numerator: '',
        denominator: '1',
      });
    } else if (m.whole === 0n) {
      setFracA({
        whole: '',
        numerator: `${m.negative ? '-' : ''}${m.remNum.toString()}`,
        denominator: m.den.toString(),
      });
    } else {
      setFracA({
        whole: `${m.negative ? '-' : ''}${m.whole.toString()}`,
        numerator: m.remNum.toString(),
        denominator: m.den.toString(),
      });
    }
  };

  const handleSwap = () => {
    const prevA = fracA;
    setFracA(fracB);
    setFracB(prevA);
  };

  const handleReset = () => {
    setFracA({ whole: '', numerator: '1', denominator: '2' });
    setFracB({ whole: '', numerator: '1', denominator: '4' });
    setOperator('+');
    setDecimalInput('0.375');
  };

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-7">
        <div>
          <p className="text-xs font-semibold text-[#007AFF] mb-2">
            Exact rational arithmetic · Mixed numbers · Step-by-step solutions
          </p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-950 leading-[1.15]">
            Fraction Calculator
          </h1>
          <p className="mt-2 text-sm text-slate-600 max-w-2xl leading-relaxed">
            Add, subtract, multiply, divide, simplify, compare, and convert fractions or mixed numbers with exact precision and visual proportion strips.
          </p>
        </div>

        {/* Mode Segmented Picker */}
        <div className="inline-flex items-center gap-1 p-1.5 liquid-segmented rounded-full self-start md:self-auto">
          {(
            [
              { id: 'operate', label: 'Calculate' },
              { id: 'simplify', label: 'Simplify' },
              { id: 'decimal', label: 'Decimal → Fraction' },
              { id: 'compare', label: 'Compare' },
            ] as Array<{ id: CalculatorMode; label: string }>
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                mode === item.id
                  ? 'liquid-segmented-active'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Two-Zone Split Layout: Left Interactive Calculator Stage (7 cols), Right Step-by-Step & History Deck (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Main Stage */}
        <div className="lg:col-span-7 space-y-6">
          <div className="liquid-glass rounded-[30px] p-6 sm:p-8">
            {/* MODE 1: OPERATE */}
            {mode === 'operate' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {QUICK_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setFracA(preset.a);
                          setFracB(preset.b);
                          setOperator(preset.op);
                        }}
                        className="liquid-btn-glass px-3 py-1.5 text-xs font-mono tabular-nums font-medium rounded-full whitespace-nowrap cursor-pointer"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSwap}
                      title="Swap Fraction A and Fraction B"
                      className="liquid-btn-glass inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full cursor-pointer"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5 text-[#007AFF]" />
                      Swap
                    </button>
                    <button
                      type="button"
                      onClick={handleReset}
                      title="Reset inputs"
                      className="liquid-btn-glass inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
                      Reset
                    </button>
                  </div>
                </div>

                {/* Operands + Operator Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-center">
                  <StackedFractionInput label="Fraction A" value={fracA} onChange={setFracA} />

                  <div className="flex sm:flex-col items-center justify-center gap-2">
                    {(['+', '-', '*', '/'] as FractionOperator[]).map((op) => {
                      const active = operator === op;
                      return (
                        <button
                          key={op}
                          type="button"
                          onClick={() => setOperator(op)}
                          aria-label={`Operator ${operatorSymbol(op)}`}
                          className={`w-11 h-11 rounded-full text-lg font-semibold flex items-center justify-center transition-all cursor-pointer ${
                            active
                              ? 'liquid-btn-primary'
                              : 'liquid-btn-glass text-slate-800'
                          }`}
                        >
                          {operatorSymbol(op)}
                        </button>
                      );
                    })}
                  </div>

                  <StackedFractionInput label="Fraction B" value={fracB} onChange={setFracB} />
                </div>

                {/* Result Panel */}
                {operateEval.error ? (
                  <div className="p-4 bg-red-50/85 backdrop-blur-md border border-red-200/90 rounded-2xl text-xs text-[#DC2626] flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{operateEval.error}</span>
                  </div>
                ) : operateEval.result ? (
                  <div className="pt-6 border-t border-slate-900/8 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-2">
                          Exact Reduced Result
                        </p>
                        <div className="flex flex-wrap items-center gap-5">
                          <StackedFractionDisplay fraction={operateEval.result.reduced} size="lg" />
                          {operateEval.result.mixed.whole > 0n &&
                            operateEval.result.mixed.remNum > 0n && (
                              <div className="text-sm text-slate-600">
                                <span className="text-slate-400 mr-2">=</span>
                                <span className="font-mono tabular-nums text-xl font-semibold text-[#0071E3]">
                                  {formatMixed(operateEval.result.reduced)}
                                </span>
                                <span className="block text-[11px] text-slate-500">
                                  Mixed number
                                </span>
                              </div>
                            )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSaveToHistory}
                          className="liquid-btn-primary px-4 py-2 text-xs font-semibold rounded-full whitespace-nowrap cursor-pointer"
                        >
                          Save to History
                        </button>
                        <button
                          type="button"
                          onClick={handleUseResultAsA}
                          className="liquid-btn-glass px-3.5 py-2 text-xs font-semibold rounded-full whitespace-nowrap cursor-pointer"
                        >
                          Use as A
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void copyText(
                              'op',
                              `${formatMixed(operateEval.result!.reduced)} (${operateEval.result!.decimal})`
                            )
                          }
                          className="liquid-btn-glass inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-full whitespace-nowrap cursor-pointer"
                        >
                          {copiedKey === 'op' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-slate-600" />
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Clean Metric Readout Row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="liquid-glass-subtle rounded-2xl p-3.5">
                        <div className="text-[11px] text-slate-500">Improper</div>
                        <div className="mt-1 text-sm font-mono tabular-nums font-semibold text-slate-900">
                          {formatImproper(operateEval.result.reduced)}
                        </div>
                      </div>
                      <div className="liquid-glass-subtle rounded-2xl p-3.5">
                        <div className="text-[11px] text-slate-500">Mixed Form</div>
                        <div className="mt-1 text-sm font-mono tabular-nums font-semibold text-slate-900">
                          {formatMixed(operateEval.result.reduced)}
                        </div>
                      </div>
                      <div className="liquid-glass-subtle rounded-2xl p-3.5">
                        <div className="text-[11px] text-slate-500">Decimal</div>
                        <div className="mt-1 text-sm font-mono tabular-nums font-semibold text-slate-900">
                          {operateEval.result.decimal}
                        </div>
                      </div>
                      <div className="liquid-glass-subtle rounded-2xl p-3.5">
                        <div className="text-[11px] text-slate-500">Percentage</div>
                        <div className="mt-1 text-sm font-mono tabular-nums font-semibold text-slate-900">
                          {operateEval.result.percentage}
                        </div>
                      </div>
                    </div>

                    {/* Visual Proportion Strips */}
                    <div className="pt-4 border-t border-slate-900/8 space-y-3.5">
                      <h3 className="text-xs font-semibold text-slate-800">
                        Visual Proportion Model
                      </h3>
                      <FractionVisualBar
                        fraction={operateEval.result.a}
                        label="Fraction A"
                        accent="#007AFF"
                      />
                      <FractionVisualBar
                        fraction={operateEval.result.b}
                        label="Fraction B"
                        accent="#0284C7"
                      />
                      <FractionVisualBar
                        fraction={operateEval.result.reduced}
                        label="Result"
                        accent="#0F172A"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* MODE 2: SIMPLIFY */}
            {mode === 'simplify' && (
              <div className="space-y-6">
                <div className="max-w-xs mx-auto">
                  <StackedFractionInput
                    label="Fraction or Mixed Number to Simplify"
                    value={fracA}
                    onChange={setFracA}
                  />
                </div>

                {simplifyEval.error ? (
                  <div className="p-4 bg-red-50/85 backdrop-blur-md border border-red-200/90 rounded-2xl text-xs text-[#DC2626] flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{simplifyEval.error}</span>
                  </div>
                ) : simplifyEval.data ? (
                  <div className="pt-6 border-t border-slate-900/8 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-2">
                          Lowest Terms
                        </p>
                        <div className="flex items-center gap-5">
                          <StackedFractionDisplay fraction={simplifyEval.data.reduced} size="lg" />
                          <span className="text-xs text-slate-500 font-mono tabular-nums">
                            GCD = {simplifyEval.data.gcdUsed.toString()}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void copyText('simp', formatMixed(simplifyEval.data!.reduced))
                        }
                        className="liquid-btn-glass inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full cursor-pointer"
                      >
                        {copiedKey === 'simp' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-600" />
                            Copy Result
                          </>
                        )}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="liquid-glass-subtle rounded-2xl p-3.5">
                        <div className="text-[11px] text-slate-500">Mixed Number</div>
                        <div className="mt-1 text-sm font-mono tabular-nums font-semibold text-slate-900">
                          {formatMixed(simplifyEval.data.reduced)}
                        </div>
                      </div>
                      <div className="liquid-glass-subtle rounded-2xl p-3.5">
                        <div className="text-[11px] text-slate-500">Decimal</div>
                        <div className="mt-1 text-sm font-mono tabular-nums font-semibold text-slate-900">
                          {simplifyEval.data.decimal}
                        </div>
                      </div>
                      <div className="liquid-glass-subtle rounded-2xl p-3.5">
                        <div className="text-[11px] text-slate-500">Percentage</div>
                        <div className="mt-1 text-sm font-mono tabular-nums font-semibold text-slate-900">
                          {simplifyEval.data.percentage}
                        </div>
                      </div>
                    </div>

                    <FractionVisualBar
                      fraction={simplifyEval.data.reduced}
                      label="Simplified Proportion"
                      accent="#007AFF"
                    />
                  </div>
                ) : null}
              </div>
            )}

            {/* MODE 3: DECIMAL TO FRACTION */}
            {mode === 'decimal' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-2">
                    Decimal value
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={decimalInput}
                      onChange={(e) => setDecimalInput(e.target.value)}
                      placeholder="e.g. 0.375, 2.75, -1.625"
                      className="flex-1 min-w-[200px] px-4 py-3 text-lg font-mono tabular-nums font-semibold liquid-glass-input rounded-2xl text-slate-950"
                    />
                    <div className="flex flex-wrap gap-2">
                      {['0.375', '0.625', '2.75', '1.125'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setDecimalInput(val)}
                          className="liquid-btn-glass px-3 py-2 text-xs font-mono tabular-nums font-medium rounded-full cursor-pointer"
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {decimalEval.error ? (
                  <div className="p-4 bg-red-50/85 backdrop-blur-md border border-red-200/90 rounded-2xl text-xs text-[#DC2626] flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{decimalEval.error}</span>
                  </div>
                ) : decimalEval.reduced ? (
                  <div className="pt-6 border-t border-slate-900/8 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-2">
                          Exact Fraction Equivalent
                        </p>
                        <div className="flex items-center gap-5">
                          <StackedFractionDisplay fraction={decimalEval.reduced} size="lg" />
                          {decimalEval.mixed &&
                            decimalEval.mixed.whole > 0n &&
                            decimalEval.mixed.remNum > 0n && (
                              <span className="font-mono tabular-nums text-xl font-semibold text-[#0071E3]">
                                = {formatMixed(decimalEval.reduced)}
                              </span>
                            )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void copyText('dec', formatMixed(decimalEval.reduced!))
                        }
                        className="liquid-btn-glass inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full cursor-pointer"
                      >
                        {copiedKey === 'dec' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-600" />
                            Copy Fraction
                          </>
                        )}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="liquid-glass-subtle rounded-2xl p-3.5">
                        <div className="text-[11px] text-slate-500">Reduced Fraction</div>
                        <div className="mt-1 text-sm font-mono tabular-nums font-semibold text-slate-900">
                          {formatImproper(decimalEval.reduced)}
                        </div>
                      </div>
                      <div className="liquid-glass-subtle rounded-2xl p-3.5">
                        <div className="text-[11px] text-slate-500">Mixed Form</div>
                        <div className="mt-1 text-sm font-mono tabular-nums font-semibold text-slate-900">
                          {formatMixed(decimalEval.reduced)}
                        </div>
                      </div>
                      <div className="liquid-glass-subtle rounded-2xl p-3.5">
                        <div className="text-[11px] text-slate-500">Percentage</div>
                        <div className="mt-1 text-sm font-mono tabular-nums font-semibold text-slate-900">
                          {formatPercentage(decimalEval.reduced)}
                        </div>
                      </div>
                    </div>

                    <FractionVisualBar
                      fraction={decimalEval.reduced}
                      label="Converted Proportion"
                      accent="#007AFF"
                    />
                  </div>
                ) : null}
              </div>
            )}

            {/* MODE 4: COMPARE */}
            {mode === 'compare' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-center">
                  <StackedFractionInput label="Fraction A" value={fracA} onChange={setFracA} />

                  <div className="flex flex-col items-center justify-center">
                    <div className="w-14 h-14 rounded-full liquid-btn-primary text-2xl font-mono font-bold flex items-center justify-center">
                      {compareEval.data ? compareEval.data.relation : '?'}
                    </div>
                    <span className="mt-1.5 text-[11px] font-medium text-slate-500">
                      {compareEval.data?.relation === '>'
                        ? 'Greater than'
                        : compareEval.data?.relation === '<'
                          ? 'Less than'
                          : compareEval.data?.relation === '='
                            ? 'Equal to'
                            : 'Compare'}
                    </span>
                  </div>

                  <StackedFractionInput label="Fraction B" value={fracB} onChange={setFracB} />
                </div>

                {compareEval.error ? (
                  <div className="p-4 bg-red-50/85 backdrop-blur-md border border-red-200/90 rounded-2xl text-xs text-[#DC2626] flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{compareEval.error}</span>
                  </div>
                ) : compareEval.data ? (
                  <div className="pt-6 border-t border-slate-900/8 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="liquid-glass-subtle rounded-2xl p-3.5">
                        <div className="text-[11px] text-slate-500">Common Denominator</div>
                        <div className="mt-1 text-sm font-mono tabular-nums font-semibold text-slate-900">
                          LCD = {compareEval.data.lcd.toString()}
                        </div>
                      </div>
                      <div className="liquid-glass-subtle rounded-2xl p-3.5">
                        <div className="text-[11px] text-slate-500">Scaled Comparison</div>
                        <div className="mt-1 text-sm font-mono tabular-nums font-semibold text-slate-900">
                          {compareEval.data.scaledANum.toString()}/{compareEval.data.lcd.toString()}{' '}
                          {compareEval.data.relation}{' '}
                          {compareEval.data.scaledBNum.toString()}/{compareEval.data.lcd.toString()}
                        </div>
                      </div>
                      <div className="liquid-glass-subtle rounded-2xl p-3.5">
                        <div className="text-[11px] text-slate-500">Exact Difference</div>
                        <div className="mt-1 text-sm font-mono tabular-nums font-semibold text-[#0071E3]">
                          {formatMixed(compareEval.data.difference)}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      <FractionVisualBar
                        fraction={compareEval.data.a}
                        label="Fraction A"
                        accent="#007AFF"
                      />
                      <FractionVisualBar
                        fraction={compareEval.data.b}
                        label="Fraction B"
                        accent="#0F172A"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Right Deck: Step-by-Step Solution + Saved History */}
        <div className="lg:col-span-5 space-y-6">
          {/* Step-by-Step Worked Proof */}
          <div className="liquid-glass rounded-[28px] p-6">
            <h2 className="text-base font-semibold text-slate-950 mb-4">
              Step-by-Step Solution
            </h2>
            {(() => {
              const activeSteps =
                mode === 'operate'
                  ? operateEval.result?.steps || []
                  : mode === 'simplify'
                    ? simplifyEval.data?.steps || []
                    : mode === 'decimal'
                      ? decimalEval.steps || []
                      : compareEval.data?.steps || [];

              if (activeSteps.length === 0) {
                return (
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Enter valid fraction inputs to view the step-by-step algebraic derivation.
                  </p>
                );
              }

              return (
                <ol className="space-y-3">
                  {activeSteps.map((step, idx) => (
                    <li key={idx} className="liquid-glass-subtle rounded-2xl p-4">
                      <div className="text-xs font-semibold text-slate-900">
                        {idx + 1}. {step.title}
                      </div>
                      <div className="mt-1.5 font-mono tabular-nums text-sm font-semibold text-[#0071E3] break-words">
                        {step.expression}
                      </div>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">{step.detail}</p>
                    </li>
                  ))}
                </ol>
              );
            })()}
          </div>

          {/* Calculation History */}
          <div className="liquid-glass rounded-[28px] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-950 flex items-center gap-2">
                <History className="w-4 h-4 text-[#007AFF]" />
                Recent Calculations
              </h2>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={() => setHistory([])}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-[#DC2626] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <p className="text-xs text-slate-500 leading-relaxed">
                Click <strong>Save to History</strong> in Calculate mode to pin expressions here for one-tap recall.
              </p>
            ) : (
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setMode('operate');
                      setFracA(item.a);
                      setFracB(item.b);
                      setOperator(item.op);
                    }}
                    className="w-full text-left liquid-glass-subtle liquid-card-interactive rounded-2xl px-4 py-3 cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono tabular-nums text-xs text-slate-700">
                        {item.expression}
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-slate-400">
                        {item.timestamp}
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="font-mono tabular-nums text-sm font-semibold text-[#0071E3]">
                        = {item.resultText}
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-slate-500">
                        ({item.decimalText})
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
