import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({plugins:[react()],resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},server:{host:'127.0.0.1',proxy:{'/api':process.env.D21_DEV_API || 'http://127.0.0.1:3001'}}});
