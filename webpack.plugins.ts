import type IForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import type { WebpackPluginInstance } from 'webpack';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ForkTsCheckerWebpackPlugin: typeof IForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

export const createRendererPlugins = (): WebpackPluginInstance[] => [
  new ForkTsCheckerWebpackPlugin({
    async: false,
    logger: 'webpack-infrastructure',
  }),
];

export const createMainPlugins = (): WebpackPluginInstance[] => [];
