var webpack = require('webpack');

module.exports = {
  entry: './index.js',
  module: {
    preLoaders: [
      {test: /\.js$/, loader: 'eslint-loader', exclude: /(node_modules|dist)/}
    ],
    loaders: [
      {test: /\.js$/, loader: 'babel-loader', exclude: /(node_modules|dist)/}
    ]
  },
  output: {
    path: __dirname + '/dist',
    filename: 'bundle.js'
  },
  // plugins: [ new webpack.optimize.UglifyJsPlugin() ]
};
