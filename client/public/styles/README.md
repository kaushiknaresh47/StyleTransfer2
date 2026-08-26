# Style reference images

Drop the style-source images here. Vite serves `client/public/` at the web root,
so `client/public/styles/starry-night.jpg` is fetched by the app as
`/styles/starry-night.jpg`.

The app reads its list from `client/src/stylePresets.js`. Each preset's `file`
field must match a filename in this folder. Expected filenames:

| Filename                     | Style                             |
| ---------------------------- | --------------------------------- |
| `starry-night.jpg`           | The Starry Night — van Gogh       |
| `the-scream.jpg`             | The Scream — Munch                |
| `great-wave.jpg`             | The Great Wave — Hokusai          |
| `composition-vii.jpg`        | Composition VII — Kandinsky       |
| `water-lilies.jpg`           | Water Lilies — Monet              |
| `the-kiss.jpg`               | The Kiss — Klimt                  |
| `les-demoiselles.jpg`        | Les Demoiselles — Picasso         |
| `persistence-of-memory.jpg`  | Persistence of Memory — Dalí      |
| `ukiyo-e.jpg`                | Ukiyo-e Woodblock — traditional   |
| `art-nouveau.jpg`            | Art Nouveau — Mucha               |

Any tile whose file is missing falls back to a gradient placeholder, so the page
renders correctly with this folder empty. Add files incrementally.

Guidance: roughly square, 600–1000px on the short edge is plenty for a picker
thumbnail. To use a different name or add an 11th style, edit `stylePresets.js`.

A note on sourcing: the works above are old enough to be in the public domain,
but a specific *photograph* of a painting can carry its own rights. Prefer an
explicitly open source such as Wikimedia Commons or a museum open-access
collection (the Met and the Art Institute of Chicago both have one).
