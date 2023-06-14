/* eslint-env node -- eslint-comment add exception because the running context is node environment */
module.exports = {
    entryPoints: [
        './src/index.ts',
        './src/toolboxes/index.ts',
        './src/vsf-notebook/src/index.ts',
        './src/vsf-snippet/src/index.ts',
        './src/vsf-canvas/src/index.ts',
    ],
    exclude: ['src/tests', '**/dist/**/*.ts'],
    out: 'dist/docs',
    theme: 'default',
    categorizeByGroup: false,
    categoryOrder: [
        'Getting Started',
        'Entry Point',
        'State',
        'View',
        'HTTP',
        'Error',
        '*',
    ],
}
