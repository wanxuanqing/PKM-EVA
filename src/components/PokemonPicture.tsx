import { useState } from 'react';

export function PokemonPicture({ dex }: { dex: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="pokemon-picture">
      {failed ? (
        <div className="pokemon-picture-placeholder">
          Picture unavailable offline or from source.
        </div>
      ) : (
        <img
          src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dex}.png`}
          alt={`Standard species artwork for Pokédex #${dex}`}
          width={144}
          height={144}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
      <figcaption>
        Standard species appearance; forms, costumes and Shadow effects may differ.{' '}
        <a href="https://github.com/PokeAPI/sprites" target="_blank" rel="noreferrer">
          Artwork via PokéAPI
        </a>
        . Pokémon artwork belongs to its respective rights holders.
      </figcaption>
    </figure>
  );
}
