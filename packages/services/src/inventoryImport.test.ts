import { describe, expect, it } from 'vitest';
import { buildHeaderMap, normalizeCondition, normalizeFinish } from './inventoryImport.js';

describe('normalizeFinish', () => {
  it('maps ManaBox finish values', () => {
    expect(normalizeFinish('normal')).toBe('nonfoil');
    expect(normalizeFinish('foil')).toBe('foil');
    expect(normalizeFinish('etched')).toBe('etched');
    expect(normalizeFinish('')).toBe('nonfoil');
    expect(normalizeFinish(undefined)).toBe('nonfoil');
    expect(normalizeFinish('true')).toBe('foil'); // Deckbox-style
  });
});

describe('normalizeCondition', () => {
  it('normalizes varied spellings to our grades', () => {
    expect(normalizeCondition('near_mint')).toBe('NM');
    expect(normalizeCondition('Near Mint')).toBe('NM');
    expect(normalizeCondition('mint')).toBe('NM');
    expect(normalizeCondition('lightly played')).toBe('LP');
    expect(normalizeCondition('good')).toBe('LP');
    expect(normalizeCondition('played')).toBe('MP');
    expect(normalizeCondition('heavily_played')).toBe('HP');
    expect(normalizeCondition('damaged')).toBe('DMG');
    expect(normalizeCondition('')).toBe('NM'); // default
  });
});

describe('buildHeaderMap', () => {
  it('maps ManaBox headers to canonical fields', () => {
    const map = buildHeaderMap([
      'Name',
      'Set code',
      'Collector number',
      'Foil',
      'Quantity',
      'Scryfall ID',
      'Condition',
      'Language',
    ]);
    expect(map.name).toBe('Name');
    expect(map.setCode).toBe('Set code');
    expect(map.collectorNumber).toBe('Collector number');
    expect(map.foil).toBe('Foil');
    expect(map.quantity).toBe('Quantity');
    expect(map.scryfallId).toBe('Scryfall ID');
    expect(map.condition).toBe('Condition');
    expect(map.language).toBe('Language');
  });

  it('maps Moxfield/Deckbox aliases (Count, Edition, Card Number)', () => {
    const map = buildHeaderMap(['Count', 'Name', 'Edition', 'Card Number', 'Foil']);
    expect(map.quantity).toBe('Count');
    expect(map.setCode).toBe('Edition');
    expect(map.collectorNumber).toBe('Card Number');
  });
});
