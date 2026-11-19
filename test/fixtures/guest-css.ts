import { rewriteGuestCSS } from '../../src/guest/css.ts';

try {
  const receiver = decodeURIComponent(location.hash.slice(1));
  const sheet = `@import url("${receiver}/theme.css");
    @supports not ((unsupported-one:1) or (unsupported-two:2)) {
      .comparison { display:grid; width:30px; background:u\\72l("${receiver}/image.svg") }
    }
    @supports (background:url("${receiver}/condition-only.png")) {
      .comparison { height:11px }
    }`;
  const measure = async (css: string) => {
    const style = document.createElement('style');
    style.textContent = css;
    const box = document.createElement('div');
    box.className = 'comparison imported';
    document.head.append(style);
    document.body.append(box);
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    const computed = getComputedStyle(box);
    const result = {
      display: computed.display,
      width: computed.width,
      height: computed.height,
      border: computed.borderTopWidth,
      background: computed.backgroundImage,
    };
    style.remove();
    box.remove();
    return result;
  };
  const native = await measure(sheet);
  const mapped: string[] = [];
  const imported =
    'data:text/css;base64,' + btoa('.imported{border:3px solid rgb(1,2,3)}');
  const image =
    'data:image/svg+xml;base64,' +
    btoa(
      '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><path fill="green" d="M0 0h2v2H0z"/></svg>',
    );
  const rewritten = rewriteGuestCSS(sheet, (url) => {
    mapped.push(url);
    if (url === receiver + '/theme.css') return imported;
    if (url === receiver + '/image.svg') return image;
    throw new Error('Unexpected fetching URL');
  });
  const protectedResult = await measure(rewritten);
  Reflect.set(globalThis, 'guestCSSResult', {
    native,
    protected: protectedResult,
    mapped,
    rewritten,
  });
} catch (error) {
  Reflect.set(globalThis, 'guestCSSResult', { error: String(error) });
}
