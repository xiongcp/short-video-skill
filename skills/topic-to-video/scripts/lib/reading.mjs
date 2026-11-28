// Spoken text for the voice-over (字幕与转场设计 §3): the script shows Arabic numbers and the voice reads them in
// Chinese. toSpoken applies the section's pronunciation terms first, then reads every remaining number. No imports.

const DIGITS = '零一二三四五六七八九';
/** A lone 2 right before one of these is read 两 (§3.2). */
const MEASURE_WORDS = '个只位名人家户种项条次回遍倍天周年岁元块股手份批件本张台辆篇首部页杯瓶斤吨米点成夜层场轮期季套款颗座架';
/** Two-character measure words after which a lone 2 is read 两; 分 alone is left out, as 2分 may be a score or a minute. */
const MEASURE_PAIRS = ['小时', '分钟', '公里', '公斤', '星期'];
/** Unit characters that belong to a number, as in 3600点 or 11月27日 (§4.1); captions keep them on the number's line. */
export const NUMBER_UNITS = '年月日号时分秒点半万亿千百倍元只个家位人次天岁股手';
const LIANG_NEXT = new Set([...MEASURE_WORDS, '万', '亿', '千', '百']);
// Latin words and numbers glued to letters (5G, H100, GPT-5) are left to the voice engine; then three or more numbers
// joined by dashes (a date or a phone number); then H:MM; then numbers with an optional sign or range mark, thousands
// commas, a decimal part and a percent sign.
const TOKEN = /[A-Za-z][A-Za-z0-9.+-]*|\d+[A-Za-z][A-Za-z0-9.+-]*|(\d+(?:[-–]\d+){2,})|([01]?\d|2[0-4]):([0-5]\d)(?![\d:])|([-−~～–]?)(\d{1,3}(?:,\d{3})+(?![\d,])|\d+)(\.\d+)?([%％]?)/g;
const AFTER_RANGE = /^(?:[-~～–到至]\d[\d,]*(?:\.\d+)?[%％]?)?(.{0,2})/u;
/** A four-digit number before a range to a year, as in 2023到2025年, is a year too. */
const YEAR_RANGE = /^[-~～–到至]\d{4}年/;

const spell = (digits) => [...digits].map((d) => DIGITS[d]).join('');

function readGroup(n) {
  const ds = String(n).padStart(4, '0');
  let out = '';
  let zero = false;
  for (let i = 0; i < 4; i += 1) {
    const d = Number(ds[i]);
    if (d === 0) {
      zero = out !== '';
      continue;
    }
    out += (zero ? '零' : '') + DIGITS[d] + ['千', '百', '十', ''][i];
    zero = false;
  }
  return out;
}

/** 3600 → 三千六百, 1005 → 一千零五, 15 → 十五, 600519 → 六十万零五百一十九 (at most 12 digits). */
function readInteger(digits) {
  const groups = [];
  for (let i = digits.length; i > 0; i -= 4) groups.unshift(Number(digits.slice(Math.max(0, i - 4), i)));
  let out = '';
  let zero = false;
  groups.forEach((g, k) => {
    if (g === 0) {
      zero = out !== '';
      return;
    }
    out += (out && (zero || g < 1000) ? '零' : '') + readGroup(g) + ['', '万', '亿'][groups.length - 1 - k];
    zero = false;
  });
  return (out || '零').replace(/^一十/, '十');
}

function readNumber(src, start, end, int, frac, pct) {
  const digits = int.replaceAll(',', '');
  const ordinal = src[start - 1] === '第';
  let reading;
  const next = AFTER_RANGE.exec(src.slice(end))[1];
  if (!frac && !pct && digits.length === 4 && (src[end] === '年' || YEAR_RANGE.test(src.slice(end)))) reading = spell(digits);
  else if ((digits.length > 1 && digits[0] === '0') || digits.length > 12) reading = spell(digits);
  else if (digits === '2' && !frac && !pct && !ordinal && (LIANG_NEXT.has(next[0]) || MEASURE_PAIRS.includes(next))) reading = '两';
  else reading = ordinal ? readInteger(digits) : readInteger(digits).replace(/^二(?=[千万亿])/, '两');
  if (frac) reading += `点${spell(frac.slice(1))}`;
  return pct ? `百分之${reading}` : reading;
}

function numberSpans(src, from, to) {
  const out = [];
  for (const m of src.slice(from, to).matchAll(TOKEN)) {
    const [whole, chain, hour, minute, mark, int, frac = '', pct] = m;
    if (chain === undefined && hour === undefined && int === undefined) continue;
    let start = from + m.index;
    const end = start + whole.length;
    if (chain !== undefined) {
      // YYYY-MM-DD reads as a date; any other chain (a phone number) digit by digit.
      const parts = chain.split(/[-–]/);
      const [month, day] = [Number(parts[1]), Number(parts[2])];
      const date = parts.length === 3 && parts[0].length === 4 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
      out.push({ start, end, text: whole, reading: date ? `${spell(parts[0])}年${readInteger(String(month))}月${readInteger(String(day))}日` : parts.map(spell).join('') });
      continue;
    }
    if (hour !== undefined) {
      const min = Number(minute);
      const h = Number(hour);
      out.push({ start, end, text: whole, reading: `${h === 2 ? '两' : readInteger(String(h))}点${min ? `${min < 10 ? '零' : ''}${readInteger(String(min))}分` : ''}` });
      continue;
    }
    const prev = out.at(-1);
    const between = prev ? src.slice(prev.end, start) : null;
    const isRange = Boolean(mark) && prev !== undefined && (between === '' || (between.length === 1 && NUMBER_UNITS.includes(between)));
    if (mark && !isRange && !'-−'.includes(mark)) start += 1;
    const core = readNumber(src, start + (mark && (isRange || '-−'.includes(mark)) ? 1 : 0), end, int, frac, pct);
    if (isRange && between === '') {
      prev.end = end;
      prev.text = src.slice(prev.start, end);
      prev.reading += `到${core}`;
      continue;
    }
    const prefix = isRange ? '到' : mark && '-−'.includes(mark) ? '负' : '';
    out.push({ start, end, text: src.slice(start, end), reading: prefix + core });
  }
  return out;
}

function termSpans(src, pronunciation) {
  const spans = [];
  for (const { term, reading } of pronunciation ?? []) {
    if (!term || !reading) continue;
    for (let i = src.indexOf(term); i >= 0; i = src.indexOf(term, i + 1)) {
      const end = i + term.length;
      if (!spans.some((s) => i < s.end && end > s.start)) spans.push({ start: i, end, text: term, reading });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

/**
 * The text the voice reads, and where it differs from the display text: `spans` lists each replaced range
 * `{ start, end, text, reading }` in display-text positions, in order. Pronunciation terms win over numbers.
 */
export function toSpoken(text, pronunciation = []) {
  const src = String(text ?? '');
  const spans = [];
  let from = 0;
  for (const term of [...termSpans(src, pronunciation), null]) {
    spans.push(...numberSpans(src, from, term ? term.start : src.length));
    if (term) spans.push(term);
    from = term ? term.end : src.length;
  }
  let spoken = '';
  let at = 0;
  for (const s of spans) {
    spoken += src.slice(at, s.start) + s.reading;
    at = s.end;
  }
  return { spoken: spoken + src.slice(at), spans };
}
