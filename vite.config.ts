import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Wildcard bypass for your lhr.life public tunnels
      allowedHosts: ['.lhr.life'],
      
      // 🌟 FIX: Stop Vite from watching files inside the data and build folders
      // This completely kills the re-triggering memory loops on your Mac
      watch: {
        ignored: ['**/dist/**', '**/.git/**', '**/node_modules/**', '**/server.ts'],
      },
      
      // Forces HMR off if necessary to prevent flickering during dynamic pipeline calls
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
