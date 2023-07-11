import type { CanvasSettings } from '../backend/compare/charts.js';

const inlinePlot: CanvasSettings = {
  width: 336,
  height: 38,
  outputType: 'svg',
  plotType: 'boxplot'
};

const allTangoColorsAsString = `
2e3436 555753 888a85 babdb6 d3d7cf ecf0eb f7f8f5
291e00 725000 c4a000 edd400 fce94f fffc9c feffd0
301700 8c3700 ce5c00 f57900 fcaf3e ffd797 fff0d7
271700 503000 8f5902 c17d11 e9b96e efd0a7 faf0d7
173000 2a5703 4e9a06 73d216 8ae234 b7f774 e4ffc7
00202a 0a3050 204a87 3465a4 729fcf 97c4f0 daeeff
170720 371740 5c3566 75507b ad7fa8 e0c0e4 fce0ff
270000 600000 a40000 cc0000 ef2929 f78787 ffcccc`;

const allTangoShadesPerColor = allTangoColorsAsString
  .split('\n')
  .map((line) => line.split(' '));

// colors are from the Extended Tango Palette
// https://emilis.info/other/extended_tango/
export const siteAesthetics = {
  changeColor: '#e9b96e',
  baseColor: '#729fcf',

  changeColorLight: '#efd0a7',
  baseColorLight: '#97c4f0',

  fastColor: '#e4ffc7',
  slowColor: '#ffcccc',

  backgroundColor: '#ffffff',

  overviewPlotWidth: 432,

  inlinePlot,

  baselineColorGradient: [
    // '#00202a',	'#0a3050',
    '#204a87',
    '#3465a4',
    '#729fcf',
    '#97c4f0'
    // '#daeeff'
  ],
  changeColorGradient: [
    // '#271700',	'#503000',
    '#8f5902',
    '#c17d11',
    '#e9b96e',
    '#efd0a7'
    // '#faf0d7'
  ],
  exeColors: [
    // the colors are from the Extended Tango Palette, columns 4-6.
    // the order is randomized
    '#fce94f',
    '#3465a4',
    '#ffd797',
    '#ad7fa8',
    '#edd400',
    '#e0c0e4',
    '#e9b96e',
    '#729fcf',
    '#8ae234',
    '#b7f774',
    '#f78787',
    '#cc0000',
    '#fffc9c',
    '#75507b',
    '#efd0a7',
    '#73d216',
    '#fcaf3e',
    '#c17d11',
    '#97c4f0',
    '#f57900',
    '#ef2929'
  ],
  lighten(color: string): string {
    const colorWithoutHash = color[0] === '#' ? color.slice(1) : color;

    for (const colorShades of allTangoShadesPerColor) {
      const index = colorShades.indexOf(colorWithoutHash);
      if (index !== -1) {
        const nextIndex = Math.min(index + 1, colorShades.length - 1);
        return `#${colorShades[nextIndex]}`;
      }
    }
    throw Error(`Color ${color} not found in allTangoShadesPerColor`);
  },
  getColorsForExecutors(executors: Set<string>): Map<string, string> {
    const colors = new Map<string, string>();
    let i = 0;
    for (const exe of executors) {
      colors.set(exe, this.exeColors[i]);
      i++;
    }
    return colors;
  }
} as const;
