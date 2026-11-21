import { createGuestWindow } from '../src/guest/session.ts';
import { createGuestGeometryPolicy } from '../src/guest/geometry-policy.ts';
import type { GuestContextCatalog } from '../src/guest/contexts/types.ts';
const check = (value: unknown, message: string): void => {
  if (!value) throw new Error(message);
};
async function run() {
  const local = createGuestGeometryPolicy({
    global: window,
    isGuestValue: () => false,
    iterator: () => {
      throw new Error('unit fixture has no guest iterator');
    },
  });
  let unknownReads = 0;
  Object.defineProperty(DOMRect.prototype, 'unreviewedGeometry', {
    configurable: true,
    get() {
      unknownReads++;
      return 17;
    },
  });
  const native = new DOMRect(1, 2, 3, 4);
  check(
    Reflect.get(native, 'unreviewedGeometry') === 17,
    'native unknowngetter positive',
  );
  unknownReads = 0;
  let denied = false;
  try {
    local.get(native, 'x');
  } catch {
    denied = true;
  }
  check(denied, 'private unproduced geometry denied');
  const made = local.construct(DOMRect, [1, 2, 3, 4]);
  check(local.get(made, 'x') === 1, 'reviewed constructor');
  denied = false;
  try {
    local.get(made, 'unreviewedGeometry');
  } catch {
    denied = true;
  }
  check(denied && unknownReads === 0, 'unknown getter denied before execution');
  const catalog: GuestContextCatalog = {
    application: 'geometry',
    generation: 'fixture',
    sourceURL: 'https://fixture.invalid/',
    documentBase: 'https://fixture.invalid/',
    runtimeURL: location.origin + '/',
    applicationURL: location.origin + '/app/',
    engineWasm: await (await fetch('/engine.wasm')).arrayBuffer(),
    workerBootstrap: {
      dedicated: new ArrayBuffer(0),
      shared: new ArrayBuffer(0),
      worklet: new ArrayBuffer(0),
    },
    resources: [],
  };
  const session = await createGuestWindow(catalog, window);
  try {
    const result = session.engine.evaluate(
      `(() => {
 function check(value,message){if(!value)throw new Error(message);}
 const point=new DOMPoint(1,2);check(point.x===1&&point.matrixTransform(new DOMMatrix().translate(3,4)).x===4,'point algebra');
 const rect=new DOMRect(1,2,3,4);check(rect.right===4&&rect.toJSON().height===4,'rect algebra');rect.width=7;check(rect.right===8,'mutable rect');
 const ro=new DOMRectReadOnly(1,2,3,4);try{ro.x=9;}catch{}check(ro.x===1,'readonly rect');
 const matrix=new DOMMatrix().translateSelf(3,4);check(matrix.e===3&&matrix.transformPoint(point).x===4,'matrix native result');check(matrix.toFloat32Array().length===16,'matrix binary result');
 const quad=new DOMQuad({x:1,y:2},{x:4,y:2},{x:4,y:6},{x:1,y:6});check(quad.getBounds().height===4&&quad.p1===quad.p1,'quad producer identity');
 const div=document.createElement('div');div.textContent='geometry';document.body.append(div);const bounds=div.getBoundingClientRect();check(bounds.width>=0,'DOM bounds producer');
 const list=div.getClientRects();check(Array.from(list).length===list.length,'guest rect list iteration');
 const range=document.createRange();range.selectNode(div);check(range.getBoundingClientRect().width>=0,'Range producer');
 const canvas=document.createElement('canvas');check(canvas.getContext('2d').getTransform().a===1,'canvas producer');
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');const r=document.createElementNS('http://www.w3.org/2000/svg','rect');r.setAttribute('width','4');r.setAttribute('height','6');r.setAttribute('transform','translate(2,3)');svg.append(r);const l=document.createElementNS('http://www.w3.org/2000/svg','polyline');l.setAttribute('points','1,2 3,4');svg.append(l);document.body.append(svg);
 const current=svg.currentTranslate;current.x=5;check(svg.currentTranslate.x===5,'live SVGPoint');
 const box=svg.firstElementChild.getBBox();check(box.width===4,'legacy SVGRect');
 const transform=svg.firstElementChild.transform.baseVal.getItem(0).matrix;check(transform.e===2,'legacy SVGMatrix chain');
 check(svg.lastElementChild.points.getItem(0).x===1&&svg.lastElementChild.points[0].x===1,'SVG point list producer');
 div.remove();svg.remove();return {point:true,rect:true,matrix:true,quad:true,DOM:true,SVG:true,list:true};
 })()`,
      'geometry:actual',
    );
    const frame = document.createElement('iframe'); document.body.append(frame);
    const childWindow = frame.contentWindow!;
    const child = await createGuestWindow(catalog, childWindow);
    try {
      const childRect = child.engine.evaluate('new DOMRect(11,12,13,14)', 'geometry:child');
      const childNode = childWindow.document.createElement('div'); childNode.textContent = 'child'; childWindow.document.body.append(childNode);
      child.engine.set('fixtureNode', childNode);
      const childList = child.engine.evaluate('fixtureNode.getClientRects()', 'geometry:child-list');
      const foreignFunction = child.engine.evaluate('() => new DOMRect(21,22,23,24)', 'geometry:child-function');
      session.engine.set('childRect', childRect);session.engine.set('childList',childList);session.engine.set('foreignFunction',foreignFunction);session.engine.set('childNode',childNode);
      check(session.engine.evaluate('childRect.x === 11 && foreignFunction().x === 21 && childNode.getBoundingClientRect().width >= 0', 'geometry:parent-crossing'), 'prepared child geometry return crossing');
      child.close();
      check(session.engine.evaluate('childRect.x === 11 && Array.from(childList).length === childList.length', 'geometry:child-closed-data'), 'geometry data remains usable after child close');
      check(session.engine.evaluate('(() => {try {foreignFunction();return false;}catch{return true;}})()', 'geometry:child-closed-code'), 'closed child code remains unavailable');
    } finally {child.close();frame.remove();}
    Reflect.set(window, '__geometryResult', result);
  } finally {
    session.close();
  }
}
run().catch((error) =>
  Reflect.set(
    window,
    '__geometryFailure',
    error instanceof Error ? error.stack : String(error),
  ),
);
