import { useCallback, useRef, useState } from 'react';
import StylePreviewModal from './StylePreviewModal.jsx';

function StyleTile({ preset, selected, onSelect, onPreview }) {
  // preset.imageUrl comes from the API (/api/styles/<id>/image); the gradient
  // swatch stands in if that request fails.
  const [missing, setMissing] = useState(false);

  return (
    // The preview control is a sibling of the select button, not a child:
    // nesting a button inside a button is invalid HTML.
    <li className={`tile${selected ? ' tile--selected' : ''}`} data-tile={preset.id}>
      <button
        type="button"
        className="tile__select"
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

      <button
        type="button"
        className="tile__preview"
        onClick={(e) => onPreview(preset.id, e.currentTarget)}
        aria-label={`Preview ${preset.name} larger`}
        title="Preview larger"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5M11 8v6M8 11h6" />
        </svg>
      </button>
    </li>
  );
}

export default function StylePicker({ styles, status, error, selectedId, onSelect }) {
  const [previewId, setPreviewId] = useState(null);
  // The button that opened the dialog, so focus can go back to it on close.
  const triggerRef = useRef(null);

  const openPreview = useCallback((id, el) => {
    triggerRef.current = el;
    setPreviewId(id);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewId(null);
    // Wait for React to unmount the dialog before restoring focus, otherwise
    // removing the focused node inside it drops focus back to <body>.
    const el = triggerRef.current;
    setTimeout(() => el?.focus(), 0);
  }, []);

  // Walk to the neighbouring style, wrapping at both ends.
  const step = useCallback((delta) => {
    setPreviewId((current) => {
      const i = styles.findIndex((s) => s.id === current);
      if (i === -1) return current;
      return styles[(i + delta + styles.length) % styles.length].id;
    });
  }, [styles]);

  const selectFromPreview = useCallback((id) => {
    onSelect(id);
    setPreviewId(null);
  }, [onSelect]);

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

  const previewed = styles.find((s) => s.id === previewId);

  return (
    <>
      <ul className="grid">
        {styles.map((preset) => (
          <StyleTile
            key={preset.id}
            preset={preset}
            selected={selectedId === preset.id}
            onSelect={onSelect}
            onPreview={openPreview}
          />
        ))}
      </ul>

      {previewed && (
        <StylePreviewModal
          preset={previewed}
          onClose={closePreview}
          onSelect={selectFromPreview}
          onStep={step}
        />
      )}
    </>
  );
}
