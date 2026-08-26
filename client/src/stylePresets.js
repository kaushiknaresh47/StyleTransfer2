// The 10 style presets shown on the landing page.
//
// `file` is resolved against client/public/styles/ and served at /styles/<file>.
// Drop a matching image into that folder and the tile picks it up automatically;
// until then the tile renders its `swatch` gradient as a placeholder.
export const STYLE_PRESETS = [
  {
    id: 'starry-night',
    name: 'The Starry Night',
    artist: 'Vincent van Gogh',
    file: 'starry-night.jpg',
    swatch: 'linear-gradient(135deg, #0b1a3f 0%, #1f4e9c 45%, #f2c14e 100%)',
  },
  {
    id: 'the-scream',
    name: 'The Scream',
    artist: 'Edvard Munch',
    file: 'the-scream.jpg',
    swatch: 'linear-gradient(135deg, #d94f1e 0%, #e8a33d 50%, #2b4a7a 100%)',
  },
  {
    id: 'great-wave',
    name: 'The Great Wave',
    artist: 'Katsushika Hokusai',
    file: 'great-wave.jpg',
    swatch: 'linear-gradient(135deg, #0d3b66 0%, #1b6ca8 55%, #f4f1de 100%)',
  },
  {
    id: 'composition-vii',
    name: 'Composition VII',
    artist: 'Wassily Kandinsky',
    file: 'composition-vii.jpg',
    swatch: 'linear-gradient(135deg, #c1443c 0%, #e8c547 40%, #3f7d8c 100%)',
  },
  {
    id: 'water-lilies',
    name: 'Water Lilies',
    artist: 'Claude Monet',
    file: 'water-lilies.jpg',
    swatch: 'linear-gradient(135deg, #2f6b52 0%, #7bb08a 45%, #d8a7c4 100%)',
  },
  {
    id: 'the-kiss',
    name: 'The Kiss',
    artist: 'Gustav Klimt',
    file: 'the-kiss.jpg',
    swatch: 'linear-gradient(135deg, #7a5c12 0%, #d4af37 50%, #f0e3b0 100%)',
  },
  {
    id: 'cubist-portrait',
    name: 'Cubist Portrait',
    artist: 'Juan Gris',
    file: 'cubist-portrait.jpg',
    swatch: 'linear-gradient(135deg, #2f4a6b 0%, #7a8fa6 50%, #c4a06a 100%)',
  },
  {
    id: 'la-grande-jatte',
    name: 'La Grande Jatte',
    artist: 'Georges Seurat',
    file: 'la-grande-jatte.jpg',
    swatch: 'linear-gradient(135deg, #3d6b4a 0%, #9cb86a 50%, #e0d29a 100%)',
  },
  {
    id: 'ukiyo-e',
    name: 'Ukiyo-e Woodblock',
    artist: 'Utagawa Hiroshige',
    file: 'ukiyo-e.jpg',
    swatch: 'linear-gradient(135deg, #6b3f2a 0%, #c88a5e 50%, #e8dcc0 100%)',
  },
  {
    id: 'art-nouveau',
    name: 'Art Nouveau',
    artist: 'Alphonse Mucha',
    file: 'art-nouveau.jpg',
    swatch: 'linear-gradient(135deg, #4a6b52 0%, #b8a06a 50%, #e3d5b8 100%)',
  },
];
