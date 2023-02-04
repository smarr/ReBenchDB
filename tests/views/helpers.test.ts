import { commonStringStart } from '../../src/views/helpers';

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
});
