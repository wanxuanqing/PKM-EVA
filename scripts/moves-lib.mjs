import { load } from 'cheerio';
import { nameKey } from './data-lib.mjs';

export function pokemonLinks(html) {
  const $ = load(html);
  return $('a[href]')
    .toArray()
    .flatMap((el) => {
      const href = $(el).attr('href');
      const name = $(el).text().trim();
      return /^\/pokemon\/\d+(?:-[A-Za-z0-9_]+)?$/.test(href) && name
        ? [{ name, url: `https://db.pokemongohub.net${href}` }]
        : [];
    });
}
export function extractPokemonMoves(html, expectedName) {
  const $ = load(html);
  const name = $('h1').first().text().trim();
  if (nameKey(name) !== nameKey(expectedName))
    throw new Error(`Form mismatch: expected ${expectedName}, got ${name}`);
  const roles = $('h4[class*="MovesetCardV2_title"]')
    .toArray()
    .flatMap((heading) => {
      const card = $(heading).parent().parent();
      const link = card.find('a[href*="/best-per-type/"]').first();
      if (!link.length) return [];
      const type = link.attr('href').split('/').pop();
      const tier = link.text().trim();
      const moveLinks = card.find('a[href^="/move/"]');
      if (moveLinks.length !== 2) throw new Error(`${name}: invalid moveset for ${type}`);
      const moves = moveLinks.toArray().map((el) => {
        const text = $(el).text().trim();
        return {
          name: text.replace(/\s*[*†]\s*/g, '').trim(),
          limited: /[*†]/.test(text),
          url: `https://db.pokemongohub.net${$(el).attr('href')}`,
        };
      });
      const text = card.text().replace(/\s+/g, ' ');
      const rank = Number(/ranks\s*#(\d+)/.exec(text)?.[1]);
      if (!/^(?:S\+?|A\+?|B\+?|C\+?|D|F)$/.test(tier) || !rank || !moves.every((m) => m.name))
        throw new Error(`${name}: incomplete tier/rank for ${type}: ${tier}`);
      return [{ type, tier, rank, moves }];
    });
  return { name, roles };
}
export const goodRaidTier = (tier) => ['S+', 'S', 'A+', 'A', 'B+', 'B'].includes(tier);
