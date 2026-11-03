import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// The version shown in the app comes from package.json (bump the patch number with every change).
import pkg from './package.json';
const {version}=pkg;
export default defineConfig({define:{__APP_VERSION__:JSON.stringify(version)},plugins:[react(),tailwindcss()],css:{postcss:{plugins:[]}},server:{strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:5080',changeOrigin:false}}},build:{outDir:'dist'}});
