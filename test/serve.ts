import { servers } from './server.ts';

const server = await servers();
console.log('Manager: http://127.0.0.1:4210/privacy-frames/');
console.log('Runtime: http://127.0.0.1:4211/runtime/');
console.log('Installer: http://127.0.0.1:4219/installation/');

process.once('SIGINT', () => void server.close());
process.once('SIGTERM', () => void server.close());
