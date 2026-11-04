import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRich, plainText } from '../js/richtext.js';

test('escapes HTML before formatting', () => {
  const html = renderRich('<img src=x onerror=alert(1)> **粗**');
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('<strong>粗</strong>'));
});

test('bold, italic, inline code, links', () => {
  const html = renderRich('**粗體** *斜體* `a*b*c` https://example.com/x。');
  assert.ok(html.includes('<strong>粗體</strong>'));
  assert.ok(html.includes('<em>斜體</em>'));
  assert.ok(html.includes('<code>a*b*c</code>'), 'no formatting inside code');
  assert.ok(html.includes('href="https://example.com/x"'), 'trailing punctuation not in link');
});

test('lists and code blocks', () => {
  const html = renderRich('說明：\n- 第一\n- 第二\n1. 甲\n2. 乙\n```\n<b>x</b>\n**y**\n```');
  assert.ok(html.includes('<ul><li>第一</li><li>第二</li></ul>'));
  assert.ok(html.includes('<ol><li>甲</li><li>乙</li></ol>'));
  assert.ok(html.includes('<pre><code>&lt;b&gt;x&lt;/b&gt;\n**y**</code></pre>'));
});

test('mentions are highlighted only for known names', () => {
  const html = renderRich('@LinLin 和 @路人', ['LinLin']);
  assert.ok(html.includes('<span class="hb-mention">@LinLin</span>'));
  assert.ok(!html.includes('@路人</span>'));
});

test('plainText strips markup', () => {
  assert.equal(plainText('**a** *b*\n- `c`'), 'a b c');
});
