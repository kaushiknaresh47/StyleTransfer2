import { useEffect, useRef } from 'react';

/**
 * Large preview of a single style. Rendered only while a style is being
 * previewed, so the effects below double as mount/unmount lifecycle.
 */
export default function StylePreviewModal({ preset, onClose, onSelect, onStep }) {
  const closeRef = useRef(null);

  // Move focus into the dialog on open. The caller restores it on close.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Keyboard: Escape closes, arrows walk the gallery.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onStep(1);
      else if (e.key === 'ArrowLeft') onStep(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onStep]);

  // Keep the page behind the overlay from scrolling.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-title"
      onClick={onClose}
    >
      {/* Stop clicks inside the panel from reaching the backdrop handler. */}
      <div className="modal__panel" onClick={(e) => e.stopPropagation()}>
        <button
          ref={closeRef}
          type="button"
          className="modal__close"
          onClick={onClose}
          aria-label="Close preview"
        >
          &times;
        </button>

        <img className="modal__img" src={preset.imageUrl} alt={preset.name} />

        <div className="modal__bar">
          <div className="modal__meta">
            <h3 className="modal__title" id="preview-title">{preset.name}</h3>
            <p className="modal__artist">{preset.artist}</p>
          </div>
          <div className="modal__nav">
            <button type="button" className="btn btn--ghost" onClick={() => onStep(-1)} aria-label="Previous style">&larr;</button>
            <button type="button" className="btn btn--ghost" onClick={() => onStep(1)} aria-label="Next style">&rarr;</button>
            <button type="button" className="btn btn--primary btn--compact" onClick={() => onSelect(preset.id)}>
              Use this style
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
