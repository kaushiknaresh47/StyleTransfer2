import { useEffect, useState } from 'react';
import ImageUploader from './components/ImageUploader.jsx';
import StylePicker from './components/StylePicker.jsx';
import { STYLE_PRESETS } from './stylePresets.js';

export default function App() {
  const [image, setImage] = useState(null);
  const [styleId, setStyleId] = useState(null);

  // Release the object URL so repeated uploads don't leak blobs.
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url); }, [image]);

  const clearImage = () => {
    if (image) URL.revokeObjectURL(image.url);
    setImage(null);
  };

  const ready = Boolean(image && styleId);
  const chosen = STYLE_PRESETS.find((p) => p.id === styleId);

  return (
    <div className="page">
      <header className="header">
        <h1 className="header__title">StyleTransfer</h1>
        <p className="header__tagline">
          Upload a photo, pick a painting, and borrow its style.
        </p>
      </header>

      <main className="main">
        <section className="step" aria-labelledby="step-1">
          <h2 className="step__heading" id="step-1">
            <span className="step__num">1</span> Upload your image
          </h2>
          <ImageUploader image={image} onSelect={setImage} onClear={clearImage} />
        </section>

        <section className="step" aria-labelledby="step-2">
          <h2 className="step__heading" id="step-2">
            <span className="step__num">2</span> Choose a style
          </h2>
          <StylePicker selectedId={styleId} onSelect={setStyleId} />
        </section>

        <section className="actions">
          <button type="button" className="btn btn--primary" disabled={!ready}>
            Apply style
          </button>
          <p className="actions__status">
            {!image && !styleId && 'Upload an image and pick a style to continue.'}
            {image && !styleId && 'Now pick a style.'}
            {!image && styleId && 'Now upload an image.'}
            {ready && `Ready: ${image.file.name} in the style of ${chosen.name}.`}
          </p>
          {ready && (
            <p className="actions__note">
              Styling isn&rsquo;t wired up yet &mdash; this button is a placeholder.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
