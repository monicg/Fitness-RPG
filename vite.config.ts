
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Use a relative base so it works on GitHub Pages subpaths
export default defineConfig({
  plugins: [react()],
  base: './',
})
