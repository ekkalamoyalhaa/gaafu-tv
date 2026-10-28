import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import { defineConfig } from 'vite';

export default defineConfig({
  envPrefix: 'PUBLIC_', // lets PUBLIC_STREAM_URL and PUBLIC_SWITCH_URL reach the site at build time
  plugins: [
    sveltekit({
      // Fully prerendered: the site is plain files, so a CDN serves every visitor.
      adapter: adapter({ pages: 'build', assets: 'build', fallback: undefined, precompress: true })
    })
  ]
});
