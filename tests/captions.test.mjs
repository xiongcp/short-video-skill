import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countChars, splitSentences } from '../skills/topic-to-video/scripts/lib/captions.mjs';

test('splits on Chinese and ASCII terminators', () => {
  assert.deepEqual(splitSentences('第一句。第二句？第三句！Fourth?'), ['第一句。', '第二句？', '第三句！', 'Fourth?']);
});

test('keeps a run of terminators together', () => {
  assert.deepEqual(splitSentences('真的吗？！我不信。'), ['真的吗？！', '我不信。']);
});

test('keeps closing quotes with their sentence', () => {
  assert.deepEqual(splitSentences('他说：“好。”然后走了。'), ['他说：“好。”', '然后走了。']);
});

test('does not split decimals, versions or ellipses', () => {
  assert.deepEqual(splitSentences('HTTP/1.1 用了 3.5 秒……很快。'), ['HTTP/1.1 用了 3.5 秒……很快。']);
});

test('keeps a trailing fragment without a terminator', () => {
  assert.deepEqual(splitSentences('第一句。没有结尾'), ['第一句。', '没有结尾']);
});

test('ignores whitespace between sentences', () => {
  assert.deepEqual(splitSentences('第一句。\n  第二句。'), ['第一句。', '第二句。']);
});

test('counts spoken characters without punctuation or spaces', () => {
  assert.equal(countChars('HTTP 缓存，快！'), 7);
});
