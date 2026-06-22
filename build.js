import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const configs = [
  // 1. popup html
  {
    configFile: false,
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      minify: false,
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'src/popup/index.html')
        },
        output: {
          entryFileNames: 'popup/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name].[ext]'
        }
      }
    }
  },
  // 2. service worker
  {
    configFile: false,
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      minify: false,
      rollupOptions: {
        input: {
          background: resolve(__dirname, 'src/background/index.ts')
        },
        output: {
          entryFileNames: 'background.js',
          codeSplitting: false,
          format: 'es'
        }
      }
    }
  },
  // 3. content script
  {
    configFile: false,
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      minify: false,
      rollupOptions: {
        input: {
          content: resolve(__dirname, 'src/content/trigger.ts')
        },
        output: {
          entryFileNames: 'content.js',
          codeSplitting: false,
          format: 'iife'
        }
      }
    }
  },
  // 4. gemini content script
  {
    configFile: false,
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      minify: false,
      rollupOptions: {
        input: {
          'gemini-content': resolve(__dirname, 'src/gemini/automation.ts')
        },
        output: {
          entryFileNames: 'gemini-content.js',
          codeSplitting: false,
          format: 'iife'
        }
      }
    }
  }
];

async function runBuilds() {
  for (let i = 0; i < configs.length; i++) {
    await build(configs[i]);
  }
}

runBuilds().catch(err => {
  console.error('Build step failed:', err);
  process.exit(1);
});
