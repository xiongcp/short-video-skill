import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitSentences } from '../skills/topic-to-video/scripts/lib/captions.mjs';
import { toSpoken } from '../skills/topic-to-video/scripts/lib/reading.mjs';
import { sentenceHash } from '../skills/topic-to-video/scripts/lib/tts.mjs';

// 字幕与转场设计 §3.2, row by row, plus the extra cases of §7.
const READINGS = [
  ['15.07%', '百分之十五点零七'], ['3.7%', '百分之三点七'], ['-2.3%', '负百分之二点三'],
  ['1.4', '一点四'], ['0.5', '零点五'],
  ['3600点', '三千六百点'], ['5300只', '五千三百只'], ['1005', '一千零五'], ['110', '一百一十'], ['15', '十五'], ['10', '十'],
  ['1.4万亿', '一点四万亿'], ['2万亿元', '两万亿元'], ['6000亿', '六千亿'],
  ['2个', '两个'], ['2倍', '两倍'], ['2点', '两点'], ['2到3倍', '两到三倍'], ['2000', '两千'], ['20000', '两万'],
  ['11月27日', '十一月二十七日'], ['2月', '二月'], ['7月', '七月'], ['2个月', '两个月'],
  ['12点半', '十二点半'], ['14:05', '十四点零五分'], ['14:00', '十四点'], ['2:30', '两点三十分'],
  ['2026年', '二零二六年'], ['2026年11月27日', '二零二六年十一月二十七日'], ['第3', '第三'], ['第2个', '第二个'],
  ['2-3倍', '两到三倍'], ['2~3倍', '两到三倍'], ['5,300只', '五千三百只'],
  ['007', '零零七'], ['000001', '零零零零零一'],
  ['5G', '5G'], ['H100', 'H100'], ['GPT-5', 'GPT-5'], ['4K', '4K'],
  ['304', '三百零四'], ['600519', '六十万零五百一十九'], ['科创50', '科创五十'],
  ['27日-28日', '二十七日到二十八日'], ['跌幅-2.3%', '跌幅负百分之二点三'], ['2%-3%', '百分之二到百分之三'],
  ['1到2个', '一到两个'], ['2到3月', '二到三月'], ['100000', '十万'], ['10500', '一万零五百'], ['100000005', '一亿零五'],
  ['超过20000人', '超过两万人'], ['iPhone 15', 'iPhone 十五'], ['', ''],
];

test('toSpoken reads every row of the 字幕与转场设计 §3.2 table', () => {
  for (const [text, spoken] of READINGS) assert.equal(toSpoken(text).spoken, spoken, text);
  assert.deepEqual(toSpoken(undefined), { spoken: '', spans: [] });
});

test('a lone 2 before a measure word reads 两, before 月 日 号 it reads 二', () => {
  for (const m of '个只位名人家户种项条次回遍倍天周年岁元块股手份批件本张台辆篇首部页杯瓶斤吨米点') assert.equal(toSpoken(`2${m}`).spoken, `两${m}`, m);
  for (const m of '月日号') assert.equal(toSpoken(`2${m}`).spoken, `二${m}`, m);
});

test('spans give each replaced range in display positions', () => {
  assert.deepEqual(toSpoken('2-3倍和27日-28日').spans, [
    { start: 0, end: 3, text: '2-3', reading: '两到三' },
    { start: 5, end: 7, text: '27', reading: '二十七' },
    { start: 8, end: 11, text: '-28', reading: '到二十八' },
  ]);
  const text = '科创50大涨15.07%，创业板涨11.61%。';
  const { spoken, spans } = toSpoken(text, [{ term: '科创50', reading: '科创五零' }]);
  assert.equal(spoken, '科创五零大涨百分之十五点零七，创业板涨百分之十一点六一。');
  assert.deepEqual(spans.map((s) => [s.start, s.end, s.text]), [[0, 4, '科创50'], [6, 12, '15.07%'], [17, 23, '11.61%']]);
  for (const s of spans) assert.equal(text.slice(s.start, s.end), s.text);
});

test('pronunciation terms win over numbers, and the first term wins over a later overlapping one', () => {
  assert.equal(toSpoken('返回304。', [{ term: '304', reading: '三零四' }]).spoken, '返回三零四。');
  assert.equal(toSpoken('返回 HTTP 304。', [{ term: 'HTTP', reading: 'H T T P' }]).spoken, '返回 H T T P 三百零四。');
  assert.equal(toSpoken('科创50指数', [{ term: '科创50', reading: '科创五零' }, { term: '50指数', reading: '五十指数' }]).spoken, '科创五零指数');
  assert.equal(toSpoken('没有数字。', [{ term: '', reading: 'x' }, { term: 'y' }]).spoken, '没有数字。');
});

// The applyPronunciation that tts.mjs used before 字幕与转场设计, kept here as the reference for old projects.
const chained = (text, pronunciation = []) => pronunciation.reduce((out, { term, reading }) => (term && reading ? out.replaceAll(term, reading) : out), text);

test('a script without Arabic digits gives the same voice text and cache key as before', () => {
  const root = join(import.meta.dirname, '..');
  const voice = { provider: 'command', command: 'edge-tts --voice {voice} --text {text} --write-media {out}' };
  let count = 0;
  for (const file of ['examples/cache-speed/project.json', 'tests/fixtures/minimal-project.json', 'tests/fixtures/world-cache.json', 'tests/fixtures/world-flight.json']) {
    const project = JSON.parse(readFileSync(join(root, file), 'utf8'));
    for (const sec of project.sections) {
      for (const sentence of splitSentences(sec.text)) {
        if (/\d/.test(sentence)) continue;
        count += 1;
        const { spoken, spans } = toSpoken(sentence, sec.pronunciation);
        assert.equal(spoken, chained(sentence, sec.pronunciation), sentence);
        assert.equal(sentenceHash(spoken, voice), sentenceHash(chained(sentence, sec.pronunciation), voice));
        if (!sec.pronunciation?.length) assert.deepEqual(spans, []);
      }
    }
  }
  assert.ok(count >= 30, `only ${count} digit-free sentences`);
});

test('a year range reads both years digit by digit, and a dash chain reads as a date or digit by digit (final review I2)', () => {
  for (const [text, spoken] of [
    ['2023到2025年', '二零二三到二零二五年'], ['2024-2025年', '二零二四到二零二五年'], ['2024~2025年间', '二零二四到二零二五年间'],
    ['2025-11-27', '二零二五年十一月二十七日'], ['400-820-8820', '四零零八二零八八二零'],
    ['2-3倍', '两到三倍'], ['27日-28日', '二十七日到二十八日'], ['2000到3000点', '两千到三千点'],
  ]) assert.equal(toSpoken(text).spoken, spoken, text);
});

test('a lone 2 before 小时 分钟 公里 公斤 星期 成 夜 层 场 轮 期 季 套 款 颗 座 架 reads 两 (final review I3)', () => {
  for (const m of ['小时', '分钟', '公里', '公斤', '星期', ...'成夜层场轮期季套款颗座架']) assert.equal(toSpoken(`2${m}`).spoken, `两${m}`, m);
  assert.equal(toSpoken('2天2夜').spoken, '两天两夜');
});
