// This code is derived from the SOM benchmarks, see AUTHORS.md file.
//
// Copyright (c) 2015-2016 Stefan Marr <git@stefan-marr.de>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
export class Benchmark {
  public async innerBenchmarkLoop(innerIterations: number): Promise<boolean> {
    for (let i = 0; i < innerIterations; i++) {
      const result = await this.benchmark();
      if (!this.verifyResult(result)) {
        return false;
      }
    }
    return true;
  }

  public async benchmark(): Promise<any> {
    throw 'benchmark is subclass responsibility';
  }

  public verifyResult(_result: any): boolean {
    throw 'verifyResult is subclass responsibility';
  }

  public async oneTimeSetup(_problemSize: string): Promise<void> {
    /* implemented in subclasses */
  }

  public async oneTimeTeardown(): Promise<void> {
    /* implemented in subclasses */
  }
}
