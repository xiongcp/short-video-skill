import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateProject } from './helpers/schema.mjs';

const minimal = () => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/minimal-project.json'), 'utf8'));
const KEY_VOICE = { provider: 'openai-compatible', base_url: 'https://api.example.com/v1', model: 'm', voice: 'v' };

test('minimal project is valid', () => {
  assert.deepEqual(validateProject(minimal()).errors, []);
});

const valid = {
  'a 9:16 plan for the L0 prompt pack': (p) => { p.settings.ratio = '9:16'; },
  'an openai-compatible voice with a key variable': (p) => { p.voice = { ...KEY_VOICE, api_key_env: 'SVS_TTS_API_KEY' }; },
  'an expression cue on a host shot': (p) => { p.shots[0].cues = [{ sentence: 0, do: 'expr', target: 'happy' }]; },
  'a new expression and a new gesture': (p) => { p.shots[0].host = { expr: 'proud', gesture: 'think' }; },
  'the legacy gesture point_right': (p) => { p.shots[0].host.gesture = 'point_right'; },
  'a move cue to an element': (p) => { p.shots[0].cues = [{ sentence: 0, do: 'move', target: 1 }]; },
  'a move cue to a preset spot': (p) => { p.shots[0].cues = [{ sentence: 0, do: 'move', target: 'right' }]; },
  'a prop cue and putting the prop down': (p) => { p.shots[0].cues = [{ sentence: 0, do: 'prop', target: 'magnifier' }, { sentence: 0, do: 'prop', target: 'none' }]; },
  'a closing quote after the last terminator': (p) => { p.sections[0].text = '他说：“答案藏在阳光里。”'; },
  'an ASCII closing quote after the last terminator': (p) => { p.sections[0].text = '他说："答案藏在阳光里。"'; },
  'a closing book-title mark after the last terminator': (p) => { p.sections[0].text = '去读《缓存。》'; },
};
for (const [name, mutate] of Object.entries(valid)) {
  test(`accepts ${name}`, () => {
    const p = minimal();
    mutate(p);
    assert.deepEqual(validateProject(p).errors, []);
  });
}

const invalid = {
  'an unknown top-level key': (p) => { p.extra = 1; },
  'section text without a sentence terminator': (p) => { p.sections[0].text = '没有句号'; },
  'a host-left shot without host': (p) => { delete p.shots[0].host; },
  'a full shot with host': (p) => { p.shots[1].host = { expr: 'happy', gesture: 'idle' }; },
  'an unknown expression': (p) => { p.shots[0].host.expr = 'angry'; },
  'bullets with five items': (p) => { p.shots[1].visual.data.items = ['一', '二', '三', '四', '五']; },
  'a title heading over 16 characters': (p) => { p.shots[0].visual.data.heading = '一二三四五六七八九十一二三四五六七'; },
  'data of another template': (p) => { p.shots[1].visual = { template: 'flow', data: { items: ['a'] } }; },
  'a reveal cue with a string target': (p) => { p.shots[1].cues[0].target = 'a'; },
  'an expression cue with an unknown expression': (p) => { p.shots[1].cues[0] = { sentence: 1, do: 'expr', target: 'angry' }; },
  'a cue without target': (p) => { delete p.shots[1].cues[0].target; },
  'a move cue to an unknown spot': (p) => { p.shots[0].cues = [{ sentence: 0, do: 'move', target: 'top' }]; },
  'a move cue to a negative element': (p) => { p.shots[0].cues = [{ sentence: 0, do: 'move', target: -1 }]; },
  'a prop cue with an unknown prop': (p) => { p.shots[0].cues = [{ sentence: 0, do: 'prop', target: 'umbrella' }]; },
  'a prop cue with an element number': (p) => { p.shots[0].cues = [{ sentence: 0, do: 'prop', target: 0 }]; },
  'an unknown cue action': (p) => { p.shots[0].cues = [{ sentence: 0, do: 'walk', target: 'left' }]; },
  'an openai-compatible voice without a key variable': (p) => { p.voice = { ...KEY_VOICE }; },
  'a lowercase key variable name': (p) => { p.voice = { ...KEY_VOICE, api_key_env: 'key' }; },
  'an unsupported ratio': (p) => { p.settings.ratio = '4:3'; },
  'a checkpoint with an unknown stage': (p) => { p.checkpoints.push({ stage: 'g3', revision: 1, at: '2026-11-23T10:00', note: '好' }); },
};
for (const [name, mutate] of Object.entries(invalid)) {
  test(`rejects ${name}`, () => {
    const p = minimal();
    mutate(p);
    assert.equal(validateProject(p).ok, false);
  });
}
