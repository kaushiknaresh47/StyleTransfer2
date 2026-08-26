# Style reference images

The style-source images. These are **not** bundled into the frontend — Express
streams them from this folder via `GET /api/styles/:id/image`
(see `server/src/routes/styles.js`).

The catalogue lives in `server/src/data/stylePresets.js`; each preset's `file`
field must match a filename here. Requests carry only a style `id`, and the
server resolves the filename from that manifest, so nothing outside this folder
is reachable. A tile whose file is missing falls back to a gradient placeholder
in the UI, so the page still renders if you remove one.

All ten are 600x600 center-cropped JPEGs (~150-220 KB each, 1.7 MB total),
downscaled from Wikimedia Commons originals.

## Provenance

Every file below is in the public domain, sourced from Wikimedia Commons and
verified via the Commons API (`extmetadata.LicenseShortName == "Public domain"`).

| File                    | Work                                      | Artist (d.)            |
| ----------------------- | ----------------------------------------- | ---------------------- |
| `starry-night.jpg`      | The Starry Night, 1889                    | van Gogh (1890)        |
| `the-scream.jpg`        | The Scream, 1893                          | Munch (1944)           |
| `great-wave.jpg`        | The Great Wave off Kanagawa, c.1831       | Hokusai (1849)         |
| `composition-vii.jpg`   | Composition VII, 1913                     | Kandinsky (1944)       |
| `water-lilies.jpg`      | Water Lilies, 1906                        | Monet (1926)           |
| `the-kiss.jpg`          | The Kiss, 1907-08                         | Klimt (1918)           |
| `cubist-portrait.jpg`   | Portrait of Pablo Picasso, 1912           | Juan Gris (1927)       |
| `la-grande-jatte.jpg`   | A Sunday on La Grande Jatte, 1884         | Seurat (1891)          |
| `ukiyo-e.jpg`           | Sudden Shower over Shin-Ohashi, 1857      | Hiroshige (1858)       |
| `art-nouveau.jpg`       | Zodiac, 1896                              | Mucha (1939)           |

### Two deliberate substitutions

The original preset list named two works that are **still under copyright**, so
they were replaced rather than downloaded:

- **Dalí, The Persistence of Memory (1931)** — Dalí died in 1989, so the work is
  protected until 2060 in life+70 jurisdictions. Replaced with Seurat's
  *La Grande Jatte* (pointillism).
- **Picasso, Les Demoiselles d'Avignon (1907)** — Picasso died in 1973;
  protected until 2043. Replaced with Juan Gris's *Portrait of Pablo Picasso*
  (1912), which keeps the cubist look and is public domain (Gris died 1927).

## Adding or changing a style

Drop a file here and add a matching entry to
`server/src/data/stylePresets.js`. No frontend change is needed — the client
renders whatever the API returns. Prefer roughly
square images, 600-1000px. When sourcing, note that the *photograph* of a
painting can carry rights of its own even when the painting is public domain —
stick to Wikimedia Commons or a museum open-access collection (the Met and the
Art Institute of Chicago both have one).
