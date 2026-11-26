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
  'a host in an outfit': (p) => { p.settings.outfit = 'hardhat'; },
  'a voice preset with a pitch tweak': (p) => { p.voice = { provider: 'undecided', preset: 'male-sunny', pitch: -3 }; },
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
  'fps, resolution, transition cut, cue.at and visual icons': (p) => {
    p.settings.fps = 60;
    p.settings.resolution = '2160p';
    p.shots[0].transition = 'cut';
    p.shots[1].visual.data.icons = ['bulb', 'globe', 'clock'];
    p.shots[1].cues[0].at = '蓝光';
  },
  'world with custom_props, stage shot, timeline, and cycle': (p) => {
    p.world = {
      metaphor: '缓存是家门口的冰箱，服务器是远处的超市',
      style: 'paper',
      scene: 'kitchen',
      custom_props: [
        {
          id: 'c_fishtank',
          label: '鱼缸',
          height: 0.5,
          layer: 'ground',
          parts: [
            { shape: 'rect', x: -0.9, y: -0.5, w: 1.8, h: 1.5, fill: 'soft_accent' },
            { shape: 'circle', cx: -0.3, cy: 0.2, r: 0.15, fill: 'yellow' },
            { shape: 'poly', points: [[0.1, 0.2], [0.4, 0.05], [0.4, 0.35]], fill: 'yellow' },
            { shape: 'line', points: [[-0.9, -0.3], [0.9, -0.3]] },
          ],
        },
      ],
    };
    p.sections[0].text = '第一句。第二句。第三句。';
    p.shots = [
      {
        id: 'sh01',
        section: 's01',
        sentences: [0],
        layout: 'stage',
        scene: 'kitchen',
        host: { expr: 'curious', gesture: 'idle', at: 'left' },
        visual: {
          template: 'stage',
          data: {
            heading: '冰箱和超市',
            objects: [
              { prop: 'fridge', label: '缓存', at: 'mid-left', state: 'closed' },
              { prop: 'c_fishtank', label: '鱼缸', at: 0.75, size: 'sm', layer: 'ground', state: 'count:2' },
            ],
            links: [{ from: 0, to: 1, style: 'dashed', label: '很远' }],
          },
        },
        note: '缓存就在手边',
      },
      {
        id: 'sh02',
        section: 's01',
        sentences: [1],
        layout: 'host-left',
        host: { expr: 'explaining', gesture: 'point' },
        visual: {
          template: 'timeline',
          data: {
            items: [
              { time: '第1步', label: '查冰箱', icon: 'fridge' },
              { time: '第2步', label: '去超市', icon: 'shop' },
            ],
          },
        },
        note: '先看顺序',
      },
      {
        id: 'sh03',
        section: 's01',
        sentences: [2],
        layout: 'full',
        visual: {
          template: 'cycle',
          data: {
            items: [
              { label: '请求', icon: 'browser' },
              { label: '缓存', icon: 'cache' },
              { label: '返回', icon: 'check' },
            ],
          },
        },
        note: '形成闭环',
      },
    ];
  },
  'interaction, state, and send cues on stage and flow': (p) => {
    p.world = {
      metaphor: '缓存是冰箱',
      style: 'paper',
      scene: 'kitchen',
      custom_props: [{ id: 'c_parcel', height: 0.3, parts: [{ shape: 'rect', x: -0.5, y: -0.5, w: 1, h: 1 }] }],
    };
    p.sections[0].text = '第一句。第二句。';
    p.shots = [
      {
        id: 'sh01',
        section: 's01',
        sentences: [0],
        layout: 'stage',
        host: { expr: 'explaining', gesture: 'idle' },
        visual: {
          template: 'stage',
          data: {
            objects: [
              { prop: 'fridge', at: 'left' },
              { prop: 'cup', at: 'mid-left' },
              { prop: 'whiteboard', at: 'center' },
              { prop: 'chair', at: 'mid-right' },
              { prop: 'cloud', at: 'right' },
            ],
            links: [{ from: 0, to: 1 }],
          },
        },
        cues: [
          { sentence: 0, do: 'open', target: 0 },
          { sentence: 0, do: 'carry', target: 1 },
          { sentence: 0, do: 'carry', target: 'none' },
          { sentence: 0, do: 'push', target: 0 },
          { sentence: 0, do: 'pull', target: 0 },
          { sentence: 0, do: 'hold_up', target: 1 },
          { sentence: 0, do: 'draw', target: 2 },
          { sentence: 0, do: 'sit_on', target: 3 },
          { sentence: 0, do: 'react', target: 4 },
          { sentence: 0, do: 'state', target: 0, value: 'expired' },
          { sentence: 0, do: 'state', target: 1, value: 'count:304' },
          { sentence: 0, do: 'send', target: 0, value: 'package' },
          { sentence: 0, do: 'send', target: 0, value: 'c_parcel' },
        ],
        note: '全套互动与状态 cue',
      },
      {
        id: 'sh02',
        section: 's01',
        sentences: [1],
        layout: 'full',
        visual: { template: 'flow', data: { nodes: ['请求', '缓存', '返回'] } },
        cues: [
          { sentence: 1, do: 'state', target: 0, value: 'crossed' },
          { sentence: 1, do: 'send', target: 1, value: 'mail' },
        ],
        note: 'flow 上使用 state 与 send',
      },
    ];
  },
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
  'an unsupported fps': (p) => { p.settings.fps = 24; },
  'an unsupported resolution': (p) => { p.settings.resolution = '720p'; },
  'an unknown transition': (p) => { p.shots[0].transition = 'wipe'; },
  'an unknown icon': (p) => { p.shots[1].visual.data.icons = ['unicorn', 'globe', 'clock']; },
  'an unknown voice preset': (p) => { p.voice = { provider: 'undecided', preset: 'male-deep' }; },
  'a pitch past 20 Hz': (p) => { p.voice = { provider: 'undecided', pitch: 25 }; },
  'a fractional pitch': (p) => { p.voice = { provider: 'undecided', pitch: 1.5 }; },
  'an unknown outfit': (p) => { p.settings.outfit = 'cape'; },
  'a stage shot without host': (p) => {
    p.shots[0] = {
      id: 'sh01', section: 's01', sentences: [0], layout: 'stage',
      visual: { template: 'stage', data: { objects: [{ prop: 'fridge', at: 'center' }] } },
      note: '缺少主持人',
    };
  },
  'a stage layout paired with bullets template': (p) => {
    p.shots[0].layout = 'stage';
    p.shots[0].visual = { template: 'bullets', data: { items: ['阳光'] } };
  },
  'a host-left layout paired with stage template': (p) => {
    p.shots[0].visual = { template: 'stage', data: { objects: [{ prop: 'fridge', at: 'center' }] } };
  },
  'a full shot with scene': (p) => {
    p.shots[1].scene = 'kitchen';
  },
  'world.metaphor over 60 characters': (p) => {
    p.world = { metaphor: '一'.repeat(61), style: 'paper', scene: 'kitchen' };
  },
  'world.custom_props over 4 items': (p) => {
    const item = (i) => ({ id: `c_p${i}`, height: 0.4, parts: [{ shape: 'circle', cx: 0, cy: 0, r: 0.3 }] });
    p.world = { metaphor: '比喻', style: 'paper', scene: 'kitchen', custom_props: [0, 1, 2, 3, 4].map(item) };
  },
  'timeline with only 1 item': (p) => {
    p.shots[1].visual = { template: 'timeline', data: { items: [{ time: '第1步', label: '唯一' }] } };
    p.shots[1].cues = [];
  },
  'cycle with only 2 items': (p) => {
    p.shots[1].visual = { template: 'cycle', data: { items: [{ label: '第一步' }, { label: '第二步' }] } };
    p.shots[1].cues = [];
  },
  'state cue without value': (p) => {
    p.shots[1].cues = [{ sentence: 1, do: 'state', target: 0 }];
  },
  'send cue without value': (p) => {
    p.shots[1].cues = [{ sentence: 1, do: 'send', target: 1 }];
  },
  'reveal cue with value': (p) => {
    p.shots[1].cues = [{ sentence: 1, do: 'reveal', target: 0, value: 'active' }];
  },
  'open cue with value': (p) => {
    p.shots[0].cues = [{ sentence: 0, do: 'open', target: 0, value: 'open' }];
  },
  'open cue with a string target': (p) => {
    p.shots[0].cues = [{ sentence: 0, do: 'open', target: 'fridge' }];
  },
  'carry cue with a non-none string target': (p) => {
    p.shots[0].cues = [{ sentence: 0, do: 'carry', target: 'cup' }];
  },
  'state cue with an invalid state value': (p) => {
    p.shots[1].cues = [{ sentence: 1, do: 'state', target: 0, value: 'bogus' }];
  },
  'send cue with a non-sendable value': (p) => {
    p.shots[1].cues = [{ sentence: 1, do: 'send', target: 1, value: 'fridge' }];
  },
};
for (const [name, mutate] of Object.entries(invalid)) {
  test(`rejects ${name}`, () => {
    const p = minimal();
    mutate(p);
    assert.equal(validateProject(p).ok, false);
  });
}
