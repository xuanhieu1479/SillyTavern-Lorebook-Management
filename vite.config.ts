import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dataPlugin from './vite-plugin-data'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dataPlugin()],
})
