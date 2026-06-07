const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    background: './src/background/background.js',
    generic_extractor: './src/content/generic_extractor.js',
    generic_injector: './src/content/generic_injector.js',
    popup: './src/popup/popup.js',
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  optimization: {
    // Crucial for MV3 Service Workers
    splitChunks: false,
  },
  module: {
    parser: {
      javascript: {
        // not let Webpack rewrite its fallback new URL() into a hashed asset.
        url: false,
      },
    },
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: '.' },
        { from: 'src/popup/popup.html', to: 'popup.html' },
        { from: 'src/popup/popup.css', to: 'popup.css' },
        { from: 'src/wasm_engine/build/thread_engine.wasm', to: 'thread_engine.wasm', noErrorOnMissing: true },
        { from: 'src/wasm_engine/build/thread_engine.js', to: 'thread_engine.js', noErrorOnMissing: true },
      ],
    }),
  ],
};
