import { describe, expect, it } from '@jest/globals';
import { filterCommitMessage } from '../../src/frontend/render.js';

describe('filterCommitMessage(msg: string)', () => {
  describe('removal of sign off lines', () => {
    it('should remove a sign off line', () => {
      const msg = `This is a message\n\nSigned-off-by: J.D. <jd@ex.com>\n`;
      const expected = `This is a message`;
      expect(filterCommitMessage(msg)).toBe(expected);
    });

    it('should remove multiple sign off lines', () => {
      const msg = `This is a message

      Signed-off-by: J.D. <jd@ex.com>\n
      Signed-off-by: A.B. <ab@ex.com>\n`;
      const expected = `This is a message`;
      expect(filterCommitMessage(msg)).toBe(expected);
    });
  });

  describe('escaping of html characters', () => {
    it('should escape html characters <, >', () => {
      const msg = `This is a message with <html> characters`;
      const expected = `This is a message with &lt;html&gt; characters`;
      expect(filterCommitMessage(msg)).toBe(expected);
    });

    it('should escape html characters ", \' and &', () => {
      const msg = `Message with ", ' and &`;
      const expected = `Message with &quot;, &#39; and &amp;`;
      expect(filterCommitMessage(msg)).toBe(expected);
    });
  });

  describe('normal messages', () => {
    it('should leave a normal message unchanged', () => {
      const msg = `Normal message with no special handling needed.`;
      const expected = `Normal message with no special handling needed.`;
      expect(filterCommitMessage(msg)).toBe(expected);
    });
  });
});
