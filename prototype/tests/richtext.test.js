import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRich, plainText } from '../js/richtext.js';

test('escapes HTML', () => {
  const html = renderRich('<img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});

test('plain text: markup symbols are shown as typed', () => {
  const html = renderRich('**粗體** *斜體* `code`\n- 項目\n```x```');
  assert.ok(!/<(strong|em|code|pre|ul|ol|li)>/.test(html));
  assert.ok(html.includes('**粗體** *斜體* `code`<br>- 項目<br>```x```'));
});

test('line breaks and paragraphs', () => {
  assert.equal(renderRich('甲\n乙\n\n丙'), '<p>甲<br>乙</p><p>丙</p>');
});

test('links, trailing punctuation excluded', () => {
  const html = renderRich('見 https://example.com/x。');
  assert.ok(html.includes('href="https://example.com/x"'));
});

test('mentions are highlighted only for known names', () => {
  const html = renderRich('@LinLin 和 @路人', ['LinLin']);
  assert.ok(html.includes('<span class="hb-mention">@LinLin</span>'));
  assert.ok(!html.includes('@路人</span>'));
});

test('plainText collapses whitespace only', () => {
  assert.equal(plainText('**a**\n- b  c'), '**a** - b c');
});
