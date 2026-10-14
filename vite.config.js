import { defineConfig } from 'vite';

// Relative base so the build works from any subfolder on the LAMP server.
export default defineConfig({
  base: './'
});
