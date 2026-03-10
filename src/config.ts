// Imgix Management API Configuration
export const IMGIX_CONFIG = {
  domain: import.meta.env.VITE_IMGIX_DOMAIN || 'your-domain.imgix.net',
  apiKey: import.meta.env.VITE_IMGIX_API_KEY || '',
  sourceId: import.meta.env.VITE_IMGIX_SOURCE_ID || '',
  secureUrlToken: import.meta.env.VITE_IMGIX_TOKEN || ''
}