import { useRef, useState } from 'react';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

const formatSize = (bytes) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default function ImageUploader({ image, onSelect, onClear }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const accept = (file) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError('Please choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('That image is larger than 10 MB.');
      return;
    }
    setError('');
    onSelect({ file, url: URL.createObjectURL(file) });
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    accept(e.dataTransfer.files?.[0]);
  };

  if (image) {
    return (
      <div className="upload upload--filled">
        <img className="upload__preview" src={image.url} alt="Your upload" />
        <div className="upload__meta">
          <span className="upload__name" title={image.file.name}>{image.file.name}</span>
          <span className="upload__size">{formatSize(image.file.size)}</span>
          <button type="button" className="btn btn--ghost" onClick={onClear}>Replace</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        className={`upload${dragging ? ' upload--dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <svg className="upload__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 16V4m0 0L8 8m4-4 4 4" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        <p className="upload__title">Drag an image here</p>
        <p className="upload__hint">or</p>
        <button type="button" className="btn" onClick={() => inputRef.current?.click()}>
          Browse files
        </button>
        <p className="upload__formats">JPG, PNG, or WebP &middot; up to 10 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          className="upload__input"
          onChange={(e) => accept(e.target.files?.[0])}
        />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
