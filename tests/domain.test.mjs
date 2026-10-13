import assert from 'node:assert/strict';
import test from 'node:test';
import { extractHost } from '../lib/domain.ts';

test('extractHost normalizes protocol, www, path, query and port', () => {
  assert.equal(extractHost('https://www.Example.com:8080/path?q=1'), 'example.com');
  assert.equal(extractHost('www.example.com/path'), 'example.com');
  assert.equal(extractHost('EXAMPLE.COM'), 'example.com');
});

test('extractHost does not create substring domain matches', () => {
  assert.notEqual(extractHost('example.co'), extractHost('example.com'));
});
