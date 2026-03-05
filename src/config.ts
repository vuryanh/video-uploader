// Imgix Management API Configuration
export const IMGIX_CONFIG = {
  domain: import.meta.env.VITE_IMGIX_DOMAIN || 'your-domain.imgix.net',
  apiKey: import.meta.env.VITE_IMGIX_API_KEY || '',
  sourceId: import.meta.env.VITE_IMGIX_SOURCE_ID || '',
  secureUrlToken: import.meta.env.VITE_IMGIX_TOKEN || ''
}

// Legacy AWS config (keeping for reference)
export const AWS_CONFIG = {
  region: import.meta.env.VITE_AWS_REGION || 'us-east-1',
  bucket: import.meta.env.VITE_S3_BUCKET || 'your-video-bucket',
  accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID || '',
  secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY || ''
}