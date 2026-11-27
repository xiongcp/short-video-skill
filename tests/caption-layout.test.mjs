import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textBox } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { layoutCaption, splitClauses, subtitlePages } from '../skills/topic-to-video/scripts/lib/timing.mjs';

const show = (pages) => pages.map((pg) => pg.join(' / ')).join(' ‖ ');
const width = (s) => textBox({ text: s, fontSize: 1, x: 0, y: 0 }).w;
// What a Node built without ICU word data does: every character is its own segment.
const perChar = (s) => [...s];

test('the four sentences of 字幕与转场设计 §4.5 break as designed, with and without the ICU word segmenter', () => {
  const examples = [
    ['科创50大涨15.07%，创业板涨11.61%。', [], '科创50大涨15.07% / 创业板涨11.61%。'],
    ['沪指涨超3.7%站稳3600点，超5300只飘红。', [], '沪指涨超3.7%站稳3600点 / 超5300只飘红。'],
    ['国内算力需求还在，订单自然流向国产芯片和设备。', ['暂停', '流向', '国产', '海外发运', '国产替代'], '国内算力需求还在 ‖ 订单自然流向 / 国产芯片和设备。'],
    ['第三股力量，是中午12点半国常会放出稳市大招。', ['国常会', '国家队', '平准基金', '入市', '分红回购'], '第三股力量 ‖ 是中午12点半国常会 / 放出稳市大招。'],
  ];
  for (const segment of [undefined, perChar]) {
    for (const [text, keywords, want] of examples) assert.equal(show(subtitlePages(text, { keywords, segment })), want, `${text} (${segment ? 'per char' : 'ICU'})`);
  }
});

test('a number group stays on one line with its units, and so does an English word', () => {
  for (const segment of [undefined, perChar]) {
    for (const [text, group] of [
      ['我们一起来看看这只股票今天涨了15.07%又跌回来。', '15.07%'], ['央行这次一共释放的资金大约是1.4万亿元。', '1.4万亿'],
      ['会议定在明天中午的12点半准时开始。', '12点半'], ['这家公司的利润大约涨了2到3倍左右。', '2到3倍'],
      ['我们约好了在11月27日那天一起去。', '11月27日'], ['这一天全市场一共有超过5,300只股票上涨。', '5,300只'],
      ['今天上午的行情是从14:05开始才明显转强。', '14:05'], ['这次发布的新显卡型号叫做RTX5090Ti。', 'RTX5090Ti'],
    ]) {
      const lines = subtitlePages(text, { segment }).flat();
      assert.ok(lines.some((l) => l.includes(group)), `${group}: ${lines.join(' / ')}`);
      for (const l of lines) assert.ok(width(l) <= 12, `${l} is ${width(l)} wide`);
    }
  }
});

test('no line starts with 的 了 着 过 吗 呢 吧 啊', () => {
  for (const segment of [undefined, perChar]) {
    for (const text of ['这是我们今天要讲的最重要的一个知识点。', '小青说这就是我们一直在找的那个答案了。', '他们终于明白了为什么天空总是蓝色的呢？']) {
      const lines = subtitlePages(text, { segment }).flat();
      assert.equal(lines.join(''), text);
      assert.ok(lines.slice(1).every((l) => !/^[的了着过吗呢吧啊]/.test(l)), lines.join(' / '));
    }
  }
});

test('only a word wider than a line is cut inside, and a clause longer than two lines fills pages two lines at a time', () => {
  const wide = 'Supercalifragilisticexpialidocious这个词。';
  const lines = subtitlePages(wide).flat();
  assert.equal(lines.join(''), wide);
  for (const l of lines) assert.ok(width(l) <= 12, l);
  const pages = subtitlePages(`${'一二三四五六七八九十'.repeat(3)}。`);
  assert.deepEqual(pages.map((pg) => pg.length), [2, 1]);
  for (const l of pages.flat()) assert.ok(width(l) <= 12, l);
});

test('splitClauses keeps 5,300 and 14:05 whole (Review Focus 2)', () => {
  assert.deepEqual(splitClauses('超5,300只，14:05开盘, 然后'), ['超5,300只，', '14:05开盘,然后']);
  assert.equal(show(subtitlePages('超5,300只，14:05开盘。')), '超5,300只 / 14:05开盘。');
});

test('landscape layout is one clause per page, and a short or one-clause sentence stays whole', () => {
  assert.deepEqual(layoutCaption('你好，世界。'), [[{ text: '你好，世界。', start: 0 }]]);
  assert.deepEqual(layoutCaption('你昨天见过的这张图标，今天再打开，还要从头下载吗？'), [
    [{ text: '你昨天见过的这张图标', start: 0 }],
    [{ text: '今天再打开', start: 11 }],
    [{ text: '还要从头下载吗？', start: 17 }],
  ]);
  assert.deepEqual(layoutCaption(''), []);
});
