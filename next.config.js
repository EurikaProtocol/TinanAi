/** @type {import('next').NextConfig} */
// Static export for Cloudflare Pages: build command `npm run build`, output directory `out`.
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};

module.exports = nextConfig;
