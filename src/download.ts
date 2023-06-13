import { createWriteStream } from 'node:fs';
import { argv } from 'node:process';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

const url = argv[2];
const targetFile = argv[3];

console.log(`Downloading ${url} to ${targetFile}`);

const file = createWriteStream(targetFile);
const { body } = await fetch(url);
await finished(Readable.fromWeb(<any>body).pipe(file));
