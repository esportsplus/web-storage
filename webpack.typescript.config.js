const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const glob = require('glob');


module.exports = ({ directory, entry, filename, library, output, production }) => {
    filename = filename || 'app';
    production = production == 'true' ? true : false;

    if (directory) {
        entry = glob.sync(`${directory}/{,!(node_modules)/**/}!(webpack)*!(.d).{ts,js}`);
    }

    if (production) {
        filename += '.min';
    }

    return {
        entry: {
            [filename]: entry
        },
        mode: (production ? 'production' : 'development'),
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: 'ts-loader',
                    exclude: /node_modules/,
                    resolve: {
                        fullySpecified: false,
                    }
                }
            ]
        },
        optimization: {
            mangleWasmImports: production,
            minimize: production,
            usedExports: production
        },
        output: {
            library: library || filename,
            path: output,
        },
        resolve: {
            extensions: ['.js', '.ts', '.tsx'],
            fullySpecified: false,
            plugins: [
                new TsconfigPathsPlugin({
                    extensions: ['.js', '.ts', '.tsx']
                })
            ]
        },
        watch: true
    };
};
