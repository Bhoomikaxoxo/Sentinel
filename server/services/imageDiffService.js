const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch').default || require('pixelmatch');

exports.calculateVisualDiff = (base64PngA, base64PngB) => {
  try {
    if (!base64PngA || !base64PngB) {
      return 0;
    }

    const bufA = Buffer.from(base64PngA, 'base64');
    const bufB = Buffer.from(base64PngB, 'base64');

    const pngA = PNG.sync.read(bufA);
    const pngB = PNG.sync.read(bufB);

    const width = pngA.width;
    const height = pngA.height;
    
    // If dimensions don't match, return 100% diff to indicate complete change
    if (pngA.width !== pngB.width || pngA.height !== pngB.height) {
      return 100;
    }

    const diffPng = new PNG({ width, height });
    const diffPixels = pixelmatch(
      pngA.data,
      pngB.data,
      diffPng.data,
      width,
      height,
      { threshold: 0.1 }
    );

    const diffPercent = (diffPixels / (width * height)) * 100;
    return parseFloat(diffPercent.toFixed(2));
  } catch (err) {
    console.error('Visual diff failed:', err.message);
    return 0;
  }
};
