import { useState } from 'react';

function StyleTile({ preset, selected, onSelect }) {
  // preset.imageUrl comes from the API (/api/styles/<id>/image); the gradient
  // swatch stands in if that request fails.
  const [missing, setMissing] = useState(false);

  return (
    <li>
      <button
        type="button"
        className={`tile${selected ? ' tile--selected' : ''}`}
        aria-pressed={selected}
        onClick={() => onSelect(preset.id)}
      >
        <span className="tile__art" style={missing ? { background: preset.swatch } : undefined}>
          {!missing && (
            <img
              className="tile__img"
              src={preset.imageUrl}
              alt=""
              loading="lazy"
              onError={() => setMissing(true)}
            />
          )}
        </span>
        <span className="tile__label">
          <span className="tile__name">{preset.name}</span>
          <span className="tile__artist">{preset.artist}</span>
        </span>
      </button>
    </li>
  );
}

export default function StylePicker({ styles, status, error, selectedId, onSelect }) {
  if (status === 'loading') {
    return (
      <ul className="grid" aria-busy="true">
        {Array.from({ length: 10 }, (_, i) => (
          <li key={i}><div className="tile tile--skeleton" /></li>
        ))}
      </ul>
    );
  }

  if (status === 'error') {
    return (
      <p className="error" role="alert">
        {error} &mdash; is the API running on port 4000?
      </p>
    );
  }

  return (
    <ul className="grid">
      {styles.map((preset) => (
        <StyleTile
          key={preset.id}
          preset={preset}
          selected={selectedId === preset.id}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}
