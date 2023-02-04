import {
  commonStringStart,
  PerIterationOutput,
  withoutStart
} from '../../src/views/helpers';

describe('Helper functions for the views', () => {
  describe('commonStringStart()', () => {
    it('should return the common start of a list of strings', () => {
      expect(commonStringStart(['foo', 'foo', 'foo'])).toBe('foo');
      expect(commonStringStart(['foo', 'foo', 'foobar'])).toBe('foo');
      expect(commonStringStart(['foo', 'foo', 'foobar', 'foobaz'])).toBe('foo');
    });

    it('should return an empty string if there is no common start', () => {
      expect(commonStringStart(['foo', 'bar', 'baz'])).toBe('');
    });

    it('should return an empty string if the list is empty', () => {
      expect(commonStringStart([])).toBe('');
    });

    it('should return empty string if list contains only empty strings', () => {
      expect(commonStringStart(['', '', ''])).toBe('');
    });

    it('should return empty string if list contains also empty strings', () => {
      expect(commonStringStart(['', '', 'foo'])).toBe('');
    });

    it('should work as expected VM name examples', () => {
      expect(
        commonStringStart([
          'SomSom-native-interp-ast',
          'SomSom-native-interp-bc'
        ])
      ).toBe('SomSom-native-interp-');

      expect(
        commonStringStart(['TruffleSOM-graal', 'TruffleSOM-graal-bc'])
      ).toBe('TruffleSOM-graal');

      expect(
        commonStringStart([
          'TruffleSOM-native-interp-ast',
          'TruffleSOM-native-interp-bc'
        ])
      ).toBe('TruffleSOM-native-interp-');
    });
  });

  describe('withoutStart()', () => {
    it('should remove a prefix from a string', () => {
      expect(withoutStart('foo', 'foobar')).toBe('bar');
    });

    it('should return the string if the prefix is not present', () => {
      expect(withoutStart('foo', 'bar')).toBe('bar');
    });

    it('should return the string if the prefix is empty', () => {
      expect(withoutStart('', 'bar')).toBe('bar');
    });

    it('should return an empty string if the string is empty', () => {
      expect(withoutStart('foo', '')).toBe('');
    });

    it('should return string if prefix is longer than the it', () => {
      expect(withoutStart('foobar', 'foo')).toBe('foo');
    });

    it('should return empty string if prefix is equal to the string', () => {
      expect(withoutStart('foo', 'foo')).toBe('');
    });

    it('should work as expected for VM name examples', () => {
      expect(
        withoutStart('SomSom-native-interp-', 'SomSom-native-interp-ast')
      ).toBe('ast');

      expect(withoutStart('TruffleSOM-graal', 'TruffleSOM-graal-bc')).toBe(
        '-bc'
      );

      expect(
        withoutStart(
          'TruffleSOM-native-interp-',
          'TruffleSOM-native-interp-ast'
        )
      ).toBe('ast');
    });
  });

  describe('PerIterationOutput', () => {
    it('should return the first string on the first call', () => {
      const output = new PerIterationOutput('first', 'second');
      expect(output.next()).toBe('first');
    });

    it('should return the second string on the second call', () => {
      const output = new PerIterationOutput('first', 'second');
      output.next();
      expect(output.next()).toBe('second');
    });

    it('should return the second string on the third call', () => {
      const output = new PerIterationOutput('first', 'second');
      output.next();
      output.next();
      expect(output.next()).toBe('second');
    });
  });
});
