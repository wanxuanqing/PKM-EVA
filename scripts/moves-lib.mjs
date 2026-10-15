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
      if (!/^(?:SS|S\+?|A\+?|B\+?|C\+?|D|E|F)$/.test(tier) || !rank || !moves.every((m) => m.name))
        throw new Error(`${name}: incomplete tier/rank for ${type}: ${tier}`);
      return [{ type, tier, rank, moves }];
    });
  return { name, roles };
}
export const goodRaidTier = (tier) => ['SS', 'S+', 'S', 'A+', 'A'].includes(tier);

// Next embeds complete client tables, including rows beyond server page one.
export function extractRankingPayload(html, type, maxBattle = false) {
  const $ = load(html);
  let flight = '';
  for (const e of $('script').toArray()) {
    const match = $(e)
      .text()
      .match(/^self\.__next_f\.push\((.*)\)$/s);
    if (match) flight += JSON.parse(match[1])[1] ?? '';
  }
  for (const line of flight.split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    let root;
    try {
      root = JSON.parse(line.slice(colon + 1));
    } catch {
      continue;
    }
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== 'object') continue;
      if (
        node.allowedType === type &&
        !!node.onlyDynamax === maxBattle &&
        node.initialData?.attackers
      )
        return node;
      stack.push(...Object.values(node));
    }
  }
  throw new Error(
    `Complete ${type} ${maxBattle ? 'Max ' : ''}ranking payload not found; source schema changed.`,
  );
}
export function extractTypeRankings(html, type) {
  const rows = extractRankingPayload(html, type).initialData.attackers;
  if (!rows.length || !rows.some((r) => goodRaidTier(r.tier)) || goodRaidTier(rows.at(-1).tier))
    throw new Error(`Incomplete ${type} tier coverage; review source pagination.`);
  for (const r of rows)
    if (
      !r.attacker?.id ||
      !r.attacker.name ||
      !r.qm?.name ||
      !r.cm?.name ||
      !Number.isInteger(r.order) ||
      !/^(SS|S\+?|A\+?|B\+?|C\+?|D|E|F)$/.test(r.tier)
    )
      throw new Error(`Invalid ${type} ranking row`);
  return rows;
}
export function extractMaxRankings(html, type) {
  const rows = extractRankingPayload(html, type, true).initialData.attackers;
  if (!rows.length) throw new Error(`Empty ${type} Max ranking`);
  const ranks = new Set();
  for (const r of rows) {
    if (
      !r.attacker?.id ||
      !r.attacker.name ||
      !r.qm?.name ||
      !r.cm?.name ||
      !r.qm.id ||
      !r.cm.id ||
      !Number.isInteger(r.order) ||
      r.order < 1 ||
      ranks.has(r.order) ||
      !(r.dynamax?.maxMoveDamage > 0) ||
      !/^(SS|S\+?|A\+?|B\+?|C\+?|D|E|F)$/.test(r.tier)
    )
      throw new Error(`Invalid ${type} Max ranking row`);
    ranks.add(r.order);
  }
  const sorted = [...rows].sort((a, b) => a.order - b.order);
  if (sorted.some((r, i) => r.order !== i + 1)) throw new Error(`Incomplete ${type} Max ranking`);
  return sorted;
}

export function matchRaidForm(row, species, aliases) {
  const explicit = aliases[row.attacker.name];
  const matches = species.filter(
    (p) =>
      p.dex === row.attacker.id &&
      (explicit ? p.id === explicit : nameKey(p.name) === nameKey(row.attacker.name)),
  );
  if (matches.length !== 1) return undefined;
  // Never let a missing Shadow variant silently resolve to its ordinary copy.
  if (matches[0].shadow !== /shadow/i.test(row.attacker.form ?? row.attacker.name))
    return undefined;
  return matches[0];
}
