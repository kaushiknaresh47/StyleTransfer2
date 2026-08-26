import { useState } from 'react';
import { STYLE_PRESETS } from '../stylePresets.js';

function StyleTile({ preset, selected, onSelect }) {
  // Falls back to the gradient swatch until a real file lands in public/styles/.
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
              src={`/styles/${preset.file}`}
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

export default function StylePicker({ selectedId, onSelect }) {
  return (
    <ul className="grid">
      {STYLE_PRESETS.map((preset) => (
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
