import { describe, expect, it } from 'vitest';
import { parseDecklist } from './decklist.js';

describe('parseDecklist', () => {
  it('parses quantity and name, with and without "x"', () => {
    const out = parseDecklist('4 Lightning Bolt\n4x Sol Ring');
    expect(out).toEqual([
      { quantity: 4, name: 'Lightning Bolt', board: 'mainboard', setCode: undefined, collectorNumber: undefined },
      { quantity: 4, name: 'Sol Ring', board: 'mainboard', setCode: undefined, collectorNumber: undefined },
    ]);
  });

  it('captures set code and collector number from annotations', () => {
    const [a] = parseDecklist('1 Sol Ring (C21) 263');
    expect(a).toMatchObject({ quantity: 1, name: 'Sol Ring', setCode: 'C21', collectorNumber: '263' });
  });

  it('keeps set code even when collector number is absent', () => {
    const [a] = parseDecklist('1 Sol Ring (C21)');
    expect(a).toMatchObject({ name: 'Sol Ring', setCode: 'C21', collectorNumber: undefined });
  });

  it('handles collector numbers with letters and dashes', () => {
    const [a] = parseDecklist('1 Jungle Shrine (PLST) OTC-303');
    expect(a).toMatchObject({ name: 'Jungle Shrine', setCode: 'PLST', collectorNumber: 'OTC-303' });
  });

  it('strips foil / etched markers', () => {
    const [a] = parseDecklist('10 Forest (SPM) 193 *F*');
    expect(a).toMatchObject({ quantity: 10, name: 'Forest', setCode: 'SPM', collectorNumber: '193' });
  });

  it('normalizes single-slash double-faced names to "//"', () => {
    const [a] = parseDecklist('1 Miles Morales / Ultimate Spider-Man (SPM) 211');
    expect(a).toMatchObject({ name: 'Miles Morales // Ultimate Spider-Man', setCode: 'SPM', collectorNumber: '211' });
  });

  it('leaves already-double-slash names intact (normalizing spacing)', () => {
    const [a] = parseDecklist('1 Fire // Ice (APC) 128');
    expect(a).toMatchObject({ name: 'Fire // Ice' });
  });

  it('preserves flavor names so set+collector can resolve them', () => {
    const [a] = parseDecklist('1 Adamantium Bonding Tank (SLD) 1741 *F*');
    expect(a).toMatchObject({ name: 'Adamantium Bonding Tank', setCode: 'SLD', collectorNumber: '1741' });
  });

  it('switches boards on section headers', () => {
    const out = parseDecklist('Commander\n1 Atraxa\nDeck\n1 Sol Ring\nSideboard\n1 Negate');
    expect(out.map((e) => e.board)).toEqual(['command', 'mainboard', 'sideboard']);
  });

  it('ignores blank lines and comments', () => {
    const out = parseDecklist('# my deck\n\n1 Sol Ring\n// note');
    expect(out).toHaveLength(1);
  });
});
