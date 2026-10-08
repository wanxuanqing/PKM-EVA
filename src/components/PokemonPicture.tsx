import { useState } from 'react';
import type { Species } from '../types';
import { pokemonArtwork } from '../lib/artwork';

export function PokemonPicture({ species }: { species: Species }) {
  const [failed, setFailed] = useState(false);
  const picture = pokemonArtwork(species);
  const src = picture.url;
  return (
    <figure className="pokemon-picture">
      {!src || failed ? (
        <div className="pokemon-picture-placeholder">
          {!src
            ? 'Picture unavailable for this form.'
            : 'Picture unavailable offline or from source.'}
        </div>
      ) : (
        <img
          src={src}
          alt={
            picture.mapped
              ? `Form artwork for ${species.name.replace(' (Shadow)', '')}`
              : `Standard species artwork for Pokédex #${species.dex}`
          }
          width={144}
          height={144}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
      <figcaption>
        {!src
          ? 'No matching form image is available.'
          : picture.mapped
            ? picture.kind === 'sprite'
              ? 'Form sprite; matching official artwork is unavailable.'
              : 'Form artwork.'
            : 'Standard species artwork.'}{' '}
        Shiny colors and Shadow effects are not shown. Pictures are not scaled to size.{' '}
        <a href="https://github.com/PokeAPI/sprites" target="_blank" rel="noreferrer">
          Artwork via PokéAPI
        </a>
        . Pokémon artwork belongs to its respective rights holders.
      </figcaption>
    </figure>
  );
}
