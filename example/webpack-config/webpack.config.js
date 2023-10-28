const path = require('path');

module.exports = {
  resolve: {
    alias: {
      '@utilities': path.resolve(__dirname, 'src/utilities/'),
      '@core': path.resolve(__dirname, 'src/core/'),
    },
  },
};