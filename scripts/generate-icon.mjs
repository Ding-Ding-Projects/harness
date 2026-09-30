import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';
import { readFile, writeFile } from 'node:fs/promises';

const svg = await readFile(new URL('../assets/icon.svg', import.meta.url));
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = sizes.map(width => new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng());
await writeFile(new URL('../assets/icon.png', import.meta.url), pngs.at(-1));
await writeFile(new URL('../assets/icon.ico', import.meta.url), await pngToIco(pngs));
