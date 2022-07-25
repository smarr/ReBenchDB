/* eslint-disable max-len */

import { simplifyCmdline } from '../src/views/render';

describe('Helper Functions for Rendering', () => {
  describe('Simplifying the command-line for display', () => {
    it('Should remove the beginning of the command-line from all command-lines', () => {
      expect(
        simplifyCmdline(
          '/data/home/gitlab-runner/builds/71gxYod2/0/sm951/awfy-runs/awfy/benchmarks/CSharp/bin/Release/net6.0/Benchmarks Queens 1000  1000'
        )
      ).toBe('Benchmarks Queens 1000  1000');

      expect(
        simplifyCmdline(
          '/data/home/gitlab-runner/builds/71gxYod2/0/sm951/truffleruby/bin/jt --use jvm-ce ruby  --experimental-options --engine.Compilation=false harness.rb Activesupport 1  30'
        )
      ).toBe(
        'jt --use jvm-ce ruby  --experimental-options --engine.Compilation=false harness.rb Activesupport 1  30'
      );

      expect(
        simplifyCmdline(
          '/data/home/gitlab-runner/builds/d258e35c/0/sm951/truffleruby/truffleruby-jvm-ce/bin/truffleruby  harness.rb Richards 1  1'
        )
      ).toBe('truffleruby  harness.rb Richards 1  1');

      expect(
        simplifyCmdline('/usr/bin/ruby2.7 harness.rb Permute 10  1000')
      ).toBe('ruby2.7 harness.rb Permute 10  1000');

      const somCmdLines = [
        '/data/home/gitlab-runner/builds/71gxYod2/0/sm951/awfy-runs/awfy/implementations/SOM/som.sh  -cp .:Core:CD:DeltaBlue:Havlak:Json:NBody:Richards:../../implementations/TruffleSOM/Smalltalk Harness.som  Richards 10  100',
        '/data/home/gitlab-runner/builds/71gxYod2/0/sm951/benchmark-runs/som-ast-interp -cp Smalltalk:Examples/Benchmarks/LanguageFeatures:Examples/Benchmarks/TestSuite Examples/Benchmarks/BenchmarkHarness.som Fibonacci 1 0  10',
        '/data/home/gitlab-runner/builds/d258e35c/0/sm951/SOMns/som -G -t1  core-lib/Benchmarks/AsyncHarness.ns Savina.AStarSearch 50 0  100:10',
        '/home/gitlab-runner/builds/d258e35c/0/sm951/SOMpp/SOM++ -cp Smalltalk:Examples/Benchmarks/Richards:Examples/Benchmarks/DeltaBlue:Examples/Benchmarks/NBody:Examples/Benchmarks/Json:Examples/Benchmarks/GraphSearch Examples/Benchmarks/BenchmarkHarness.som DeltaBlue 10 0  50'
      ];

      const simplified = somCmdLines.map((c) => simplifyCmdline(c));

      for (const c of simplified) {
        expect(c).toMatch(/^som/i);
      }

      expect(simplifyCmdline('generate-report')).toBe('generate-report');
      expect(simplifyCmdline('get-exp-data')).toBe('get-exp-data');
      expect(simplifyCmdline('python3.10 harness.py List 25  1500')).toBe(
        'python3.10 harness.py List 25  1500'
      );
    });
  });
});
