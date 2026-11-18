import assert from 'node:assert/strict';
import test from 'node:test';
import { rewriteGuestCSS } from '../src/guest/css.ts';

test('CSS parsing maps URLs, escaped URL functions and escaped imports', () => {
  const found: string[] = [];
  const css = rewriteGuestCSS(
    '@\\69mport "theme.css"; a{background:u\\72l("image.png");mask:url(mask.svg)}',
    (url) => {
      found.push(url);
      return 'https://runtime.invalid/' + url;
    },
  );
  assert.deepEqual(found, ['theme.css', 'image.png', 'mask.svg']);
  assert(css.includes('@import "https://runtime.invalid/theme.css"'));
  assert(css.includes('url("https://runtime.invalid/image.png")'));
});

test('image-set string candidates map while MIME and font-family strings remain data', () => {
  const found: string[] = [];
  const css = rewriteGuestCSS(
    'a{background:image-set("one.png" 1x type("image/png"),url(two.png) 2x);font-family:"Example"}',
    (url) => {
      found.push(url);
      return '/local/' + url;
    },
  );
  assert.deepEqual(found, ['one.png', 'two.png']);
  assert(css.includes('type("image/png")'));
  assert(css.includes('font-family:"Example"'));
});

test('inline declarations and SVG value grammars use the same resource mapping', () => {
  assert.equal(
    rewriteGuestCSS('background:url(a.png); color:red', (url) => '/local/' + url),
    'background:url(/local/a.png);color:red',
  );
  assert.equal(
    rewriteGuestCSS('url(#shape)', (url) => url, 'value'),
    'url(#shape)',
  );
});

test('namespace and supports URLs do not acquire resource semantics', () => {
  const mapped: string[] = [];
  const css = rewriteGuestCSS(
    '@namespace svg url(http://www.w3.org/2000/svg); @supports (background:url(a.png)){a{background:url(b.png)}}',
    (url) => {
      mapped.push(url);
      return '/local/' + url;
    },
  );
  assert.deepEqual(mapped, ['b.png']);
  assert(css.includes('http://www.w3.org/2000/svg'));
});

test('invalid CSS is withheld and an invalid individual URL becomes inert data', () => {
  assert.equal(
    rewriteGuestCSS('a{background:u\\72l(https://outside.invalid/a)}', (url) => url),
    '',
  );
  assert.equal(
    rewriteGuestCSS('a{background:url(invalid);color:red}', () => {
      throw new TypeError('Invalid URL');
    }),
    'a{background:url(data:,);color:red}',
  );
});
