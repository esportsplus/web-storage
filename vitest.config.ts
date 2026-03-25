import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';


export default defineConfig({
    resolve: {
        alias: {
            '~': resolve(__dirname, './src')
        }
    },
    test: {
        environment: 'happy-dom',
        exclude: ['build/**', 'node_modules/**', 'storage/**'],
        include: ['tests/**/*.ts']
    }
});
