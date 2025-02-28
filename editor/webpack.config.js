const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')
const ForkTsCheckerAsyncOverlayWebpackPlugin = require('fork-ts-checker-async-overlay-webpack-plugin')
const CleanTerminalPlugin = require('clean-terminal-webpack-plugin')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const ScriptExtHtmlWebpackPlugin = require('script-ext-html-webpack-plugin')
const InterpolateHtmlPlugin = require('react-dev-utils/InterpolateHtmlPlugin')
const TerserPlugin = require('terser-webpack-plugin')
const path = require('path')
const webpack = require('webpack')
const { RelativeCiAgentWebpackPlugin } = require('@relative-ci/agent')

const Production = 'production'
const Staging = 'staging'
const Development = 'development'

const verbose = process.env.VERBOSE === 'true'
const performance = process.env.PERFORMANCE === 'true' // This is for performance testing, which combines the dev server with production config
const hot = !performance && process.env.HOT === 'true' // For running the webpack-dev-server in hot mode
const mode = process.env.WEBPACK_MODE ?? (performance ? Production : Development) // Default to 'development' unless we are running the performance test
const actualMode = mode === Staging ? Production : mode
const isDev = mode === Development || performance
const isStaging = mode === Staging
const isProd = !(isDev || isStaging)
const isProdOrStaging = isProd || isStaging

const runCompiler = isDev && process.env.RUN_COMPILER !== 'false' // For when you want to run the compiler in a separate tab

// eslint-disable-next-line no-console
console.log(
  `Running with options: mode - ${mode}, hot - ${hot}, performance - ${performance}, runCompiler - ${runCompiler}.`,
)

function srcPath(subdir) {
  return path.join(__dirname, 'src', subdir)
}

// Webpack bug - you have to use the same hash pattern for chunkFilename as filename
// Bug report: https://github.com/webpack/webpack/issues/10724
// Options are:
// 1. [hash] - this is a new string generated with every build, and is the only option in hot mode
// 2. [chunkhash] - this is a hash of the chunk itself, so if the chunk stays the same then so does the hash
// 3. [contenthash] - this is a hash of the extracted data of the chunk, which appears to only be useful when
//                    using the ExtractedTextPlugin - https://v4.webpack.js.org/plugins/extract-text-webpack-plugin/
const hashPattern = hot ? '[contenthash]' : '[chunkhash]' // I changed [hash] to [contenthash] as per https://webpack.js.org/migrate/5/#clean-up-configuration

const BaseDomain = isProd ? 'https://cdn.utopia.app' : isStaging ? 'https://cdn.utopia.pizza' : ''
const VSCodeBaseDomain = BaseDomain === '' ? '${window.location.origin}' : BaseDomain

const config = {
  mode: actualMode,

  entry: {
    editor: hot
      ? ['react-hot-loader/patch', './src/templates/editor-entry-point.tsx']
      : './src/templates/editor-entry-point.tsx',
    preview: hot
      ? ['react-hot-loader/patch', './src/templates/preview.tsx']
      : './src/templates/preview.tsx',
    propertyControlsInfo: hot
      ? ['react-hot-loader/patch', './src/templates/property-controls-info.tsx']
      : './src/templates/property-controls-info.tsx',
    vsCodeEditorOuterIframe: hot
      ? ['react-hot-loader/patch', './src/templates/vscode-editor-outer-iframe.tsx']
      : './src/templates/vscode-editor-outer-iframe.tsx',
  },

  output: {
    crossOriginLoading: 'anonymous',
    filename: (chunkData) => {
      return `[name].${hashPattern}.js`
    },
    chunkFilename: `[id].${hashPattern}.js`,
    path: __dirname + '/lib',
    library: 'utopia',
    libraryTarget: 'umd',
    publicPath: `${BaseDomain}/editor/`,
  },

  plugins: [
    new CleanTerminalPlugin(),

    // This plugin was not really built for multiple output webpack projects like ours
    // Therefore you have to add it multiple times to generate a new file per output,
    // deciding which modules to include or exclude each time.
    new HtmlWebpackPlugin({
      // First run it to generate the editor's index.html
      chunks: ['editor'],
      inject: 'head', // Add the script tags to the end of the <head>
      scriptLoading: 'defer',
      template: './src/templates/index.html',
      minify: false,
    }),
    new HtmlWebpackPlugin({
      chunks: [],
      inject: 'head', // Add the script tags to the end of the <head>
      scriptLoading: 'defer',
      template: './src/templates/project-not-found.html',
      filename: 'project-not-found.html',
      minify: false,
    }),
    new HtmlWebpackPlugin({
      // Run it again to generate the preview.html
      chunks: ['preview'],
      inject: 'head', // Add the script tags to the end of the <head>
      scriptLoading: 'defer',
      template: './src/templates/preview.html',
      filename: 'preview.html',
      minify: false,
    }),
    new HtmlWebpackPlugin({
      // Run it again to generate the preview.html
      chunks: ['propertyControlsInfo'],
      inject: 'head', // Add the script tags to the end of the <head>
      scriptLoading: 'defer',
      template: './src/templates/property-controls-info.html',
      filename: 'property-controls-info.html',
      minify: false,
    }),
    new HtmlWebpackPlugin({
      chunks: ['vsCodeEditorOuterIframe'],
      inject: 'head', // Add the script tags to the end of the <head>
      scriptLoading: 'defer',
      template: './src/templates/vscode-editor-outer-iframe.html',
      filename: 'vscode-editor-outer-iframe/index.html',
      minify: false,
    }),
    new HtmlWebpackPlugin({
      chunks: [],
      inject: 'head', // Add the script tags to the end of the <head>
      scriptLoading: 'defer',
      template: './src/templates/vscode-editor-inner-iframe.html',
      filename: 'vscode-editor-inner-iframe/index.html',
      minify: false,
    }),
    new ScriptExtHtmlWebpackPlugin({
      // Support CORS so we can use the CDN endpoint from either of the domains
      custom: {
        test: /\.js$/,
        attribute: 'crossorigin',
        value: 'anonymous',
      },
    }),
    new InterpolateHtmlPlugin(HtmlWebpackPlugin, {
      // This plugin replaces variables of the form %VARIABLE% with the value provided in this object
      UTOPIA_SHA: process.env.UTOPIA_SHA ?? 'nocommit',
      UTOPIA_DOMAIN: BaseDomain,
      VSCODE_DOMAIN: VSCodeBaseDomain,
    }),

    // Optionally run the TS compiler in a different thread, but as part of the webpack build still
    ...(runCompiler
      ? [
          new ForkTsCheckerAsyncOverlayWebpackPlugin({
            checkerPlugin: new ForkTsCheckerWebpackPlugin({
              memoryLimit: 4096,
            }),
          }),
        ]
      : []),

    // Needed when running the webpack-dev-server in hot mode
    ...(hot ? [new webpack.HotModuleReplacementPlugin()] : []),
    ...(isProdOrStaging
      ? [
          new CleanWebpackPlugin({
            // Clean up TS transpile results after bundling
            cleanAfterEveryBuildPatterns: ['lib/*/'],
          }),
        ]
      : []),

    // Webpack 5 does not provide buffer out of the box
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    }),

    new webpack.DefinePlugin({
      // with Webpack 5, process is not shimmed anymore, these are some properties that I had to replace with undefined so the various checks do not throw a runtime type error
      'process.platform': 'undefined',
      'process.env.BABEL_TYPES_8_BREAKING': 'undefined',
      'process.env.JEST_WORKER_ID': 'undefined',
      'process.env.HOT_MODE': hot,
    }),

    // setting up the various process.env.VARIABLE replacements
    new webpack.EnvironmentPlugin([
      'REACT_APP_ENVIRONMENT_CONFIG',
      'REACT_APP_AUTH0_CLIENT_ID',
      'REACT_APP_AUTH0_ENDPOINT',
      'REACT_APP_AUTH0_REDIRECT_URI',
      'REACT_APP_COMMIT_HASH',
    ]),

    new webpack.EnvironmentPlugin({
      GOOGLE_WEB_FONTS_KEY: '', // providing an empty default for GOOGLE_WEB_FONTS_KEY for now
    }),

    new webpack.ProvidePlugin({ BrowserFS: 'browserfs' }), // weirdly, the browserfs/dist/shims/fs shim assumes a global BrowserFS being available

    ...(process.env.RELATIVE_CI_KEY
      ? [
          new RelativeCiAgentWebpackPlugin({
            includeCommitMessage: false,
          }),
        ]
      : []),
  ],

  resolve: {
    // Add '.ts' and '.tsx' as resolvable extensions.
    extensions: ['.ts', '.tsx', '.js', '.json', '.ttf'],
    symlinks: true, // We set this to false as we have symlinked some common code from the website project
    alias: {
      uuiui: srcPath('uuiui'),
      'uuiui-deps': srcPath('uuiui-deps'),
      fs: require.resolve('./node_modules/browserfs/dist/shims/fs'),
      process: require.resolve('./node_modules/browserfs/dist/shims/process'),
      'react/jsx-runtime': require.resolve('./node_modules/react/jsx-runtime'),
      react: require.resolve('./node_modules/react'),

      // Support running the profiler against production build of react
      ...(performance ? { 'scheduler/tracing': 'scheduler/tracing-profiling' } : {}),

      // Extra aliases required when using react's hot loading
      ...(hot
        ? {
            'react-dom$': '@hot-loader/react-dom/profiling',
          }
        : {}),
    },
    fallback: {
      path: require.resolve('path-browserify'),
      os: false,
      stream: require.resolve('stream-browserify'), // needed for jszip
    },
  },

  externals: {
    domtoimage: 'domtoimage',
    'source-map-support': 'should-never-succeed', // I don't know what this is?
  },

  module: {
    // FIXME The below is deprecated, but linter worker relies on a few packages that throw warnings if this isn't set
    // The modules: typescript and eslint-plugin-react
    // The warning: "Critical dependency: the request of a dependency is an expression"
    // Relevant SO: https://stackoverflow.com/questions/42908116/webpack-critical-dependency-the-request-of-a-dependency-is-an-expression
    exprContextCritical: false,

    rules: [
      // handles jest-message-utils importing 'graceful-fs'
      { test: /graceful-fs/, use: 'null-loader' },
      // Match typescript
      {
        exclude: /node_modules(?!\/utopia-api)/,
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
            },
          },

          // Required when using react's hot loading
          ...(hot ? [{ loader: 'react-hot-loader/webpack' }] : []),
        ],
      },

      // CSS Loading.
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },

      {
        test: /node_modules[/\\]eslint4b[/\\]dist[/\\].*.js$/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              plugins: ['@babel/plugin-transform-dotall-regex'],
            },
          },
        ],
      },

      // Patch for `babel-eslint` -- accessing `global` causes build error.
      {
        test: /node_modules[/\\]babel-eslint[/\\]lib[/\\]analyze-scope\.js$/,
        use: [
          {
            loader: 'string-replace-loader',
            options: {
              search: 'require("./patch-eslint-scope")',
              replace: 'Object',
            },
          },
        ],
      },

      // Fonts
      {
        test: /\.ttf$/,
        use: ['file-loader'],
      },
    ],
  },

  devServer: isDev
    ? {
        host: '0.0.0.0',
        port: 8088,
        allowedHosts: 'all', // Because we are proxying this
        hot: hot,
        static: {
          directory: path.join(__dirname, 'resources'),
          watch: true,
        },
        devMiddleware: {
          stats: {
            assets: false,
            colors: true,
            version: false,
            hash: false,
            timings: false,
            chunks: false,
            chunkModules: false,
          },
        },
        client: {
          overlay: {
            warnings: false,
            errors: true,
          },
        },
      }
    : {},

  optimization: {
    minimize: isProd,
    minimizer: isProd
      ? [
          new TerserPlugin({
            parallel: true,
            terserOptions: {
              ecma: 8,
            },
          }),
        ]
      : [],
    moduleIds: 'hashed', // "Short hashes as ids for better long term caching."
    splitChunks: {
      chunks: 'all',
    },
  },

  performance: {
    hints: false, // We get it webpack, our asse(t)s are huge, you don't need to tell us every time
  },

  // Caching to speed up subsequent builds. We don't want this for regular production mode, but do want this for
  // the performance test (which still sets mode: 'production')
  cache: isDev,

  // Use default source maps in dev mode, or attach a source map if in prod
  devtool: isProd ? 'source-map' : 'eval',

  stats: isProdOrStaging
    ? {
        assetsSpace: 1000,
        chunkGroupMaxAssets: 1000,
        groupAssetsByEmitStatus: false,
        groupAssetsByChunk: false,
        colors: true,
      }
    : {},
}

if (verbose) {
  // eslint-disable-next-line no-console
  console.log(`Final config: \n${JSON.stringify(config, null, 2)}`)
}

module.exports = config
