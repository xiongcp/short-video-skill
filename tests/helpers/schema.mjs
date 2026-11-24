import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schema = JSON.parse(readFileSync(join(import.meta.dirname, '../../skills/topic-to-video/schema/project.schema.json'), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strictTypes: false }).compile(schema);

/** Validates a project against project.schema.json; each error reads "<instancePath> <message>". */
export function validateProject(project) {
  const ok = validate(project);
  return { ok, errors: ok ? [] : validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`) };
}
