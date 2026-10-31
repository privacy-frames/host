/**
 * Prepared-Window probes use the production message fetch adapter with a fixture
 * service worker. Supply its diagnostic log locally and reject other resources.
 * This is neither installation admission nor a production authorization check.
 * Messages never create entries in the fixture's native FetchEvent log.
 */
export function fixtureControllerMessages(log?: 'events' | 'log'): string {
  const diagnostic = log === undefined ? 'undefined' : log;
  return `
self.addEventListener('message', event => {
  const packet = event.data;
  const port = event.ports[0];
  if (!port) return;
  if (packet?.type === 'privacy-installed-resource') {
    const diagnostic = ${diagnostic};
    const path = new URL(packet.url).pathname;
    if (diagnostic && ['/events','/app/events'].includes(path)) {
      const body = new TextEncoder().encode(JSON.stringify(diagnostic)).buffer;
      port.postMessage({ok:true,value:{url:packet.url,status:200,statusText:'OK',
        headers:[['content-type','application/json']],body}},[body]);
    } else port.postMessage({ok:false,error:'Fixture resource unavailable'});
    port.close();
  }
  if (packet?.type === 'privacy-publisher-rpc' && packet.operation === 'status') {
    port.postMessage({ok:true,value:null});
    port.close();
  }
});`;
}
