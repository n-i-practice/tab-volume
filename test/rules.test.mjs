import assert from 'node:assert/strict';
import test from 'node:test';
import { createRule, matchesRule, ruleKey } from '../extension/rules.js';

const example = new URL('https://example.com/watch?v=ABC&title=音量&t=30#first');

test('host rules ignore scheme, port, path, query and fragment, and distinguish subdomains', () => {
  const rule = createRule(example, 'host', []);
  assert.equal(ruleKey(rule), 'volume-rule:["host","example.com","",[]]');
  assert.equal(matchesRule(rule, new URL('http://example.com:8080/other?x=1#second')), true);
  assert.equal(matchesRule(rule, new URL('https://www.example.com/watch')), false);
  assert.equal(matchesRule(rule, null), false);
});

test('path rules ignore query and fragment and distinguish case and trailing slash', () => {
  const rule = createRule(example, 'path', []);
  assert.equal(ruleKey(rule), 'volume-rule:["path","example.com","/watch",[]]');
  assert.equal(matchesRule(rule, new URL('https://example.com/watch#second')), true);
  assert.equal(matchesRule(rule, new URL('https://example.com/watch/')), false);
  assert.equal(matchesRule(rule, new URL('https://example.com/Watch')), false);
});

test('selected query parameters have stable keys and require one exact value per name', () => {
  const reordered = new URL('https://example.com/watch?title=%E9%9F%B3%E9%87%8F&v=ABC&t=60#second');
  const rule = createRule(example, 'query', ['v', 'title']);
  assert.equal(ruleKey(rule), 'volume-rule:["query","example.com","/watch",[["title","音量"],["v","ABC"]]]');
  assert.equal(ruleKey(rule), ruleKey(createRule(reordered, 'query', ['title', 'v'])));
  assert.equal(matchesRule(rule, reordered), true);
  for (const query of ['title=音量', 'v=ABC', 'title=音量&v=XYZ', 'title=音量&v=ABC&v=ABC']) {
    assert.equal(matchesRule(rule, new URL('https://example.com/watch?' + query)), false, query);
  }
});
