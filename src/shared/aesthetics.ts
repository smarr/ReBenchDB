import type { CanvasSettings } from '../backend/compare/charts.js';

const inlinePlot: CanvasSettings = {
  width: 336,
  height: 38,
  outputType: 'svg',
  plotType: 'boxplot'
};

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
  ]
} as const;
