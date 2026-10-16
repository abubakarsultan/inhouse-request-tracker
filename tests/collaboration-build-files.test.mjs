import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const component = (name) => path.join(root, 'components', 'app', 'collaboration', name);

test('collaboration wizard and actions are separate client components', () => {
  const wizardPath = component('partner-wizard.tsx');
  const actionsPath = component('partner-actions.tsx');
  assert.ok(existsSync(wizardPath));
  assert.ok(existsSync(actionsPath));
  const wizard = readFileSync(wizardPath, 'utf8');
  const actions = readFileSync(actionsPath, 'utf8');
  for (const [name, source] of [['wizard', wizard], ['actions', actions]]) {
    assert.match(source, /^['"]use client['"];?/);
    assert.doesNotMatch(source, /(?:^|\n)cat >|(?:^|\n)(?:TS|TSX)(?:\n|$)/);
  }
  assert.match(wizard, /export default function PartnerWizard/);
  for (const exportName of ['ConnectPartnerSheet', 'DealCreator', 'LinkCreator', 'LinkRowActions', 'AllocateGiven']) {
    assert.match(actions, new RegExp(`export function ${exportName}\\(`));
  }
});

test('partner details imports actions from the existing component module', () => {
  const details = readFileSync(path.join(root, 'app', '(protected)', 'collaborations', '[id]', 'page.tsx'), 'utf8');
  assert.match(details, /@\/components\/app\/collaboration\/partner-actions/);
  assert.ok(existsSync(component('partner-actions.tsx')));
});
