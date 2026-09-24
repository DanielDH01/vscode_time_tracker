const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production');

async function main() {
  const extensionConfig = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    sourcemap: !isProduction,
    minify: isProduction,
    target: 'node16',
    logLevel: 'info',
  };

  const webviewConfig = {
    entryPoints: ['src/webview/main.ts'],
    bundle: true,
    outfile: 'dist/webview.js',
    format: 'iife',
    platform: 'browser',
    sourcemap: !isProduction,
    minify: isProduction,
    target: 'es2020',
    logLevel: 'info',
  };

  const testConfig = {
    entryPoints: ['src/test/timesheet.test.ts'],
    bundle: true,
    outfile: 'dist/test/timesheet.test.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    sourcemap: !isProduction,
    target: 'node16',
    logLevel: 'info',
  };

  // Ensure dist directory exists
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist', { recursive: true });
  }

  // Copy CSS and schemas to dist if needed
  function copyStaticAssets() {
    if (fs.existsSync('src/webview/styles.css')) {
      fs.copyFileSync('src/webview/styles.css', 'dist/webview.css');
    }
  }

  copyStaticAssets();

  if (isWatch) {
    const ctxExt = await esbuild.context(extensionConfig);
    const ctxWeb = await esbuild.context(webviewConfig);
    await ctxExt.watch();
    await ctxWeb.watch();
    console.log('[watch] Build watching for changes...');
  } else {
    await esbuild.build(extensionConfig);
    await esbuild.build(webviewConfig);
    if (fs.existsSync('src/test/timesheet.test.ts')) {
      await esbuild.build(testConfig);
    }
    console.log('[build] Build completed successfully.');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
