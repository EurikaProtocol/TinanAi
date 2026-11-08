import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default {
  ...defineCloudflareConfig(),
  // Plain Next.js build; `npm run build` itself runs the OpenNext build, so this avoids recursion.
  buildCommand: 'next build',
};
