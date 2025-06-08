import { Readable } from 'stream';
import {
  Chart as ChartJS,
  ChartConfiguration,
  ChartComponentLike
} from 'chart.js';
import { createCanvas, registerFont, Image } from 'canvas';
import { BackgroundColourPlugin } from './backgroundColourPlugin.js';

export type ChartJSNodeCanvasPlugins = {
  /**
   * Global plugins,
   * see https://www.chartjs.org/docs/latest/developers/plugins.html.
   */
  readonly modern?: ReadonlyArray<string | ChartComponentLike>;
};
export type ChartCallback = (chartJS: typeof ChartJS) => void | Promise<void>;
export type CanvasType = 'pdf' | 'svg';
export type MimeType = 'image/png' | 'image/jpeg';

// https://github.com/Automattic/node-canvas#non-standard-apis
type Canvas = HTMLCanvasElement & {
  toBuffer(
    callback: (err: Error | null, result: Buffer) => void,
    mimeType?: string,
    config?: any
  ): void;
  toBuffer(mimeType?: string, config?: any): Buffer;
  createPNGStream(config?: any): Readable;
  createJPEGStream(config?: any): Readable;
  createPDFStream(config?: any): Readable;
};

export interface ChartJSNodeCanvasOptions {
  /**
   * The width of the charts to render, in pixels.
   */
  readonly width: number;
  /**
   * The height of the charts to render, in pixels.
   */
  readonly height: number;
  /**
   * Optional callback which is called once with a new ChartJS
   * global reference as the only parameter.
   */
  readonly chartCallback?: ChartCallback;
  /**
   * Optional canvas type ('PDF' or 'SVG'),
   * see the [canvas pdf doc
   * ](https://github.com/Automattic/node-canvas#pdf-output-support).
   */
  readonly type?: CanvasType;
  /**
   * Optional plugins to register.
   */
  readonly plugins?: ChartJSNodeCanvasPlugins;

  /**
   * Optional background color for the chart, otherwise it will be transparent.
   * Note, this will apply to all charts.
   * See the [fillStyle](https://www.w3schools.com/tags/canvas_fillstyle.asp)
   * canvas API used for possible values.
   */
  readonly backgroundColour?: string;
}

export class ChartJSNodeCanvas {
  private readonly _width: number;
  private readonly _height: number;
  private readonly _chartJs: typeof ChartJS;
  private readonly _type?: CanvasType;

  /**
   * Create a new instance of CanvasRenderService.
   *
   * @param options Configuration for this instance
   */
  constructor(options: ChartJSNodeCanvasOptions) {
    if (options === null || typeof options !== 'object') {
      throw new Error('An options parameter object is required');
    }
    if (!options.width || typeof options.width !== 'number') {
      throw new Error('A width option is required');
    }
    if (!options.height || typeof options.height !== 'number') {
      throw new Error('A height option is required');
    }

    this._width = options.width;
    this._height = options.height;
    this._type = options.type && (options.type.toLowerCase() as CanvasType);
    this._chartJs = this.initialize(options);
  }

  /**
   * Render to a data url.
   * @see https://github.com/Automattic/node-canvas#canvastodataurl
   *
   * @param configuration The Chart JS configuration for the chart to render.
   * @param mimeType The image format, `image/png` or `image/jpeg`.
   */
  public renderToDataURL(
    configuration: ChartConfiguration,
    mimeType: MimeType = 'image/png'
  ): Promise<string> {
    const chart = this.renderChart(configuration);
    return new Promise<string>((resolve, reject) => {
      if (!chart.canvas) {
        return reject(new Error('Canvas is null'));
      }
      const canvas = chart.canvas as Canvas;
      try {
        const png = canvas.toDataURL(mimeType, 1);
        chart.platform.releaseContext(chart.ctx);
        (<any>chart).canvas = null;
        (<any>chart).ctx = null;

        chart.destroy();
        return resolve(png);
      } catch (error) {
        return reject(error);
      }
    });
  }

  /**
   * Render to a data url synchronously.
   * @see https://github.com/Automattic/node-canvas#canvastodataurl
   *
   * @param configuration The Chart JS configuration for the chart to render.
   * @param mimeType The image format, `image/png` or `image/jpeg`.
   */
  public renderToDataURLSync(
    configuration: ChartConfiguration,
    mimeType: MimeType = 'image/png'
  ): string {
    const chart = this.renderChart(configuration);
    if (!chart.canvas) {
      throw new Error('Canvas is null');
    }
    const canvas = chart.canvas as Canvas;
    const dataUrl = canvas.toDataURL(mimeType);
    chart.platform.releaseContext(chart.ctx);
    (<any>chart).canvas = null;
    (<any>chart).ctx = null;

    chart.destroy();
    return dataUrl;
  }

  /**
   * Render to a buffer.
   * @see https://github.com/Automattic/node-canvas#canvastobuffer
   *
   * @param configuration The Chart JS configuration for the chart to render.
   * @param mimeType A string indicating the image format.
   *   Valid options are `image/png`, `image/jpeg` (if node-canvas was
   *   built with JPEG support) or `raw` (unencoded ARGB32 data in
   *   native-endian byte order, top-to-bottom).
   *   Defaults to `image/png` for image canvases, or the corresponding type
   *   for PDF or SVG canvas.
   */
  public renderToBuffer(
    configuration: ChartConfiguration,
    mimeType: MimeType = 'image/png'
  ): Promise<Buffer> {
    const chart = this.renderChart(configuration);
    return new Promise<Buffer>((resolve, reject) => {
      if (!chart.canvas) {
        throw new Error('Canvas is null');
      }
      const canvas = chart.canvas as Canvas;
      canvas.toBuffer((error: Error | null, buffer: Buffer) => {
        chart.platform.releaseContext(chart.ctx);
        (<any>chart).canvas = null;
        (<any>chart).ctx = null;

        chart.destroy();
        if (error) {
          return reject(error);
        }
        return resolve(buffer);
      }, mimeType);
    });
  }

  /**
   * Render to a buffer synchronously.
   * @see https://github.com/Automattic/node-canvas#canvastobuffer
   *
   * @param configuration The Chart JS configuration for the chart to render.
   * @param mimeType A string indicating the image format.
   * 		Valid options are `image/png`, `image/jpeg` (if node-canvas
   * 		was built with JPEG support), `raw` (unencoded ARGB32 data in
   * 		native-endian byte order, top-to-bottom), `application/pdf`
   * 		(for PDF canvases) and image/svg+xml (for SVG canvases).
   * Defaults to `image/png` for image canvases,
   * or the corresponding type for PDF or SVG canvas.
   */
  public renderToBufferSync(
    configuration: ChartConfiguration,
    mimeType: MimeType | 'application/pdf' | 'image/svg+xml' = 'image/png'
  ): Buffer {
    const chart = this.renderChart(configuration);
    if (!chart.canvas) {
      throw new Error('Canvas is null');
    }
    const canvas = chart.canvas as Canvas;
    const buffer = canvas.toBuffer(mimeType);

    chart.platform.releaseContext(chart.ctx);
    (<any>chart).canvas = null;
    (<any>chart).ctx = null;

    chart.destroy();
    return buffer;
  }

  /**
   * Render to a stream.
   * @see https://github.com/Automattic/node-canvas#canvascreatepngstream
   *
   * @param configuration The Chart JS configuration for the chart to render.
   * @param mimeType A string indicating the image format.
   * 		Valid options are `image/png`, `image/jpeg` (if node-canvas was
   * 		built with JPEG support), `application/pdf` (for PDF canvases)
   * 		and image/svg+xml (for SVG canvases). Defaults to `image/png`
   * 		for image canvases, or the corresponding type for PDF or SVG canvas.
   */
  public renderToStream(
    configuration: ChartConfiguration,
    mimeType: MimeType | 'application/pdf' = 'image/png'
  ): Readable {
    const chart = this.renderChart(configuration);
    if (!chart.canvas) {
      throw new Error('Canvas is null');
    }
    const canvas = chart.canvas as Canvas;
    setImmediate(() => {
      chart.platform.releaseContext(chart.ctx);
      (<any>chart).canvas = null;
      (<any>chart).ctx = null;
      chart.destroy();
    });
    switch (mimeType) {
      case 'image/png':
        return canvas.createPNGStream();
      case 'image/jpeg':
        return canvas.createJPEGStream();
      case 'application/pdf':
        return canvas.createPDFStream();
      default:
        throw new Error(`Un-handled mimeType: ${mimeType}`);
    }
  }

  /**
   * Use to register the font with Canvas to use a font file that is not
   * installed as a system font, this must be done before the Canvas is
   * created.
   *
   * @param path The path to the font file.
   * @param options The font options.
   * @example
   * registerFont('comicsans.ttf', { family: 'Comic Sans' });
   */
  public registerFont(
    path: string,
    options: {
      readonly family: string;
      readonly weight?: string;
      readonly style?: string;
    }
  ): void {
    registerFont(path, options);
  }

  private initialize(options: ChartJSNodeCanvasOptions): typeof ChartJS {
    if (options.plugins?.modern) {
      for (const plugin of options.plugins.modern) {
        if (typeof plugin === 'string') {
          console.error(
            `Plugin needs to be loaded, but got a string: ${plugin}`
          );
        } else {
          ChartJS.register(plugin);
        }
      }
    }

    if (options.chartCallback) {
      options.chartCallback(ChartJS);
    }

    if (options.backgroundColour) {
      ChartJS.register(
        new BackgroundColourPlugin(
          options.width,
          options.height,
          options.backgroundColour
        )
      );
    }

    return ChartJS;
  }

  private renderChart(configuration: ChartConfiguration): ChartJS {
    const canvas = createCanvas(this._width, this._height, this._type);
    (canvas as any).style = (canvas as any).style || {};
    // Disable animation (otherwise charts will throw exceptions)
    configuration.options = configuration.options || {};
    configuration.options.responsive = false;
    configuration.options.animation = false as any;
    const context = canvas.getContext('2d');
    (global as any).Image = Image; // Some plugins use this API
    const chart = new this._chartJs(context as any, configuration);
    delete (global as any).Image;
    return chart;
  }
}
