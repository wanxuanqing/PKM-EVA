import type { Catalog } from '../types';
import { gymSource, gymReviewed } from '../lib/gym';
export function DataPanel({ data }: { data: Catalog }) {
  return (
    <section className="data-panel page-panel">
      <span className="eyebrow">ABOUT / DATA</span>
      <h1>Know what’s behind the verdict.</h1>
      <p className="intro">
        A versioned catalog, transparent calculations, and a little room for uncertainty.
      </p>
      <div className="data-stats">
        <div>
          <strong>{data.counts.forms.toLocaleString()}</strong>
          <span>catalog forms</span>
        </div>
        <div>
          <strong>{data.counts.dexSpecies}</strong>
          <span>unique Pokédex species</span>
        </div>
        <div>
          <strong>4,096</strong>
          <span>IV combinations by default</span>
        </div>
      </div>
      <section className="paper">
        <h2>Gym defense</h2>
        <p>
          25 exact regular forms from GO Hub's S/A+ species-bulk shortlist, reviewed {gymReviewed}.
          Reachable evolutions are included; conditional paths require review. Normal types are
          allowed. Ratings do not extend to Shadow or temporary forms.
        </p>
        <p>
          This role has no IV threshold or IV rank. Base Defense × Stamina does not model moves,
          typing, motivation decay or gym activity. Keep advice is not an instruction to power up
          every copy.
        </p>
        <a href={gymSource} target="_blank" rel="noreferrer">
          Gym-defense source
        </a>
      </section>
      <section className="paper">
        <h2>Understand the IV measures</h2>
        <dl className="definitions">
          <div>
            <dt>Species rank</dt>
            <dd>
              How a species and form compare with other Pokémon in an open league. PvPoke overall
              ranks 1–199 qualify; rank 200 does not. Shadow rankings stay separate.
            </dd>
          </div>
          <div>
            <dt>IV rank & percentile</dt>
            <dd>
              How this IV spread’s stat product compares with other eligible spreads of the same
              form. Rank is 1 plus the number with a strictly higher product. Ties share a rank.
              Percentile is 100 × (N − rank) / (N − 1); a pool of one is 100%.
            </dd>
          </div>
          <div>
            <dt>% of ideal stat product</dt>
            <dd>
              Your effective Attack × Defense × floored HP, divided by the best product in your
              selected pool. This is a measure of stats, not battle wins.
            </dd>
          </div>
          <div>
            <dt>Overall IV percentage</dt>
            <dd>
              (Attack IV + Defense IV + HP IV) / 45 × 100. Your rule is strictly above 90%: 41/45
              qualifies; 40/45 does not. ML and raids use this same IV preference, even though ML
              also shows a separate stat-product rank and percentile. For GL/UL, the separate app
              default is IV percentile strictly above 95%.
            </dd>
          </div>
        </dl>
      </section>
      <section className="paper">
        <h2>What this version can tell you</h2>
        <p>
          GL and UL use CP caps of 1,500 and 2,500. Open ML is uncapped; Mega and Primal forms,
          Ditto, and Shedinja are excluded from these PvP assessments. The selected level controls
          your stat comparison; the species rankings retain their source’s league settings and are
          not re-simulated at a custom level.
        </p>
        <p>
          Default comparison: all 0–15 IVs, including theoretical spreads that may be unobtainable
          for some Pokémon. A chosen IV floor is explicit. Minimum levels and eligibility come from
          source rules and reviewed exceptions. Current level never alters the comparison pool.
        </p>
        <p>
          Stat products use unrounded Attack and Defense, HP floored with a minimum of 10, and CP
          floored with a minimum of 10. Equal products share a rank using stable 0.000001-wide
          numeric buckets. Every tied ideal is shown in card details.
        </p>
      </section>
      <section className="paper">
        <h2>Catalog audit</h2>
        <p>
          <b>{data.audit.csvRankChanges}</b> original target-rank claims differ from the retrieved
          rankings. All <b>{data.audit.csvRaidClaims}</b> CSV raid claims were retained for audit,
          with live-source shortlists separated from unverified suggestions.
        </p>
        <ul>
          {data.audit.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <p>
          <b>Availability:</b> all {data.audit.unknownRelease.toLocaleString()} CSV forms retain an
          unverified release status. A species being searchable or ranked is not proof of a released
          GO form. Selecting a copy does not infer shiny, costume or Max Battle capability. Fixed
          gender follows the selected species or battle form; otherwise select the copy’s gender
          explicitly. Cosmetic gender variants share a battle record when sourced stats and moves
          match. Distinct battle forms keep their IDs and league rankings.
        </p>
        <details>
          <summary>Specific coverage gaps</summary>
          <p>
            Missing base stats:{' '}
            {data.audit.missingStats.length
              ? data.audit.missingStats.join(', ')
              : 'none in the input catalog'}
            .
          </p>
          <p>
            Exact evolution rules incomplete:{' '}
            {data.audit.missingEvolutionRules.join(', ') || 'none'}.
          </p>
          <ul>
            {data.audit.rejectedEdges.map((e, i) => (
              <li key={i}>
                {e.from} → {e.to}: {e.reason}
              </li>
            ))}
          </ul>
        </details>
      </section>
      <section className="paper">
        <h2>Sources & freshness</h2>
        <p>
          Snapshot retrieved {new Date(data.retrieved).toLocaleString()}. Data is bundled with the
          app and does not refresh during a search.
        </p>
        <div className="source-cards">
          {data.sources.map((s) => (
            <article key={s.id}>
              <h3>
                {s.url.startsWith('https://') ? (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.name} ↗
                  </a>
                ) : (
                  s.name
                )}
              </h3>
              <p>
                Retrieved {s.retrieved.slice(0, 10)}
                {s.date ? ` · Source date ${s.date.slice(0, 10)}` : ''}
              </p>
              {s.commit && <code>{s.commit}</code>}
              {s.license && <p>{s.license}</p>}
            </article>
          ))}
        </div>
        <p className="small-note">
          Snapshot {data.version} · Calculator {data.calculatorVersion}.{' '}
          <a href="/PVPOKE-LICENSE.txt" target="_blank" rel="noreferrer">
            PvPoke MIT license
          </a>
          .
        </p>
      </section>
      {data.movesheet && (
        <section className="paper">
          <h2>Moves datasheet</h2>
          <p>
            {data.movesheet.pvp} qualifying PvP entries checked against pinned PvPoke rankings and
            move pools. {data.movesheet.raidFormsWithMoves} raid forms have sourced moves;{' '}
            {data.movesheet.raidFormsMissingMoves} still need qualifying evidence.
          </p>
          <p>
            Expanded raid suggestions use GO Hub type roles rated B or better. Lower-rated and
            excluded Normal roles remain documented in the datasheet. Limited-access moves retain
            their markers.
          </p>
          <p>
            <a href={data.movesheet.csv} download>
              Download moves datasheet (CSV)
            </a>
            {' · '}
            <a href={data.movesheet.json} download>
              Download moves datasheet (JSON)
            </a>
          </p>
        </section>
      )}
      <section className="paper">
        <h2>On your device</h2>
        <p>
          Preferences, recent searches, and optional saved assessments stay in this browser. Clear
          browser site data to erase them. Calculations work in a background worker, with up to 32
          distributions cached by form, league, level, comparison floor and snapshot version.
        </p>
        <p>
          After the offline-ready indicator appears, this installed app can reopen without a
          connection. Use your browser’s “Add to Home Screen” or install menu where supported.
          Updates load as a complete app-and-data version after you choose to reload. A first visit
          requires a connection.
        </p>
        <p>
          PKM-EVA is an independent fan tool, unaffiliated with Pokémon GO or its owners. It offers
          advice only and never performs game actions. No accounts, analytics or paid services are
          required.
        </p>
        <p>
          Hosting providers receive normal web-request metadata and may retain logs. Entered IVs and
          saved assessments are not uploaded by this app.{' '}
          <a
            href="https://github.com/wanxuanqing/PKM-EVA/blob/main/docs/privacy.md"
            target="_blank"
            rel="noreferrer"
          >
            Privacy and local storage
          </a>
          .
        </p>
      </section>
    </section>
  );
}
