import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STYLE_PRESETS } from '../data/stylePresets.js';

const router = Router();

// server/src/routes/ -> server/assets/styles/
const ASSET_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/styles'
);

/**
 * GET /api/styles
 * The catalogue. Returns metadata plus, for each style, the URL the browser
 * should hit for the actual picture. The client renders straight from this —
 * add a preset here and it appears in the UI with no frontend change.
 */
router.get('/', (_req, res) => {
  res.json({
    styles: STYLE_PRESETS.map(({ id, name, artist, swatch }) => ({
      id,
      name,
      artist,
      swatch,
      imageUrl: `/api/styles/${id}/image`,
    })),
  });
});

/**
 * GET /api/styles/:id/image
 * Streams one style image. The `:id` is matched against the manifest and the
 * filename comes from there, so a crafted id can't escape ASSET_DIR.
 */
router.get('/:id/image', (req, res, next) => {
  const preset = STYLE_PRESETS.find((p) => p.id === req.params.id);
  if (!preset) {
    return res.status(404).json({ error: `No style with id "${req.params.id}"` });
  }

  const filePath = path.join(ASSET_DIR, preset.file);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `Image missing for style "${preset.id}"` });
  }

  res.sendFile(filePath, { maxAge: '7d', immutable: false }, (err) => {
    if (err) next(err);
  });
});

export default router;
