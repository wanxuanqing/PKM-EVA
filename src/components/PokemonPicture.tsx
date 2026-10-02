import { useState } from 'react';
import type { Species } from '../types';
import artwork from '../data/artwork-forms.json';

export function PokemonPicture({ species }: { species: Species }) {
  const [failed, setFailed] = useState(false);
  const formId = species.id.replace(/_shadow$/, '');
  const regional = (artwork.forms as Record<string, { url: string }>)[formId];
  const src =
    regional?.url ??
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${species.dex}.png`;
  return (
    <figure className="pokemon-picture">
      {failed ? (
        <div className="pokemon-picture-placeholder">
          Picture unavailable offline or from source.
        </div>
      ) : (
        <img
          src={src}
          alt={
            regional
              ? `Regional artwork for ${species.name.replace(' (Shadow)', '')}`
              : `Standard species artwork for Pokédex #${species.dex}`
          }
          width={144}
          height={144}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
      <figcaption>
        {regional
          ? 'Regional form artwork; costumes, shiny colors and Shadow effects are not shown.'
          : 'Standard species appearance; other forms, costumes and Shadow effects may differ.'}{' '}
        <a href="https://github.com/PokeAPI/sprites" target="_blank" rel="noreferrer">
          Artwork via PokéAPI
        </a>
        . Pokémon artwork belongs to its respective rights holders.
      </figcaption>
    </figure>
  );
}
