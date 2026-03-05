import { IMGIX_CONFIG } from '../config'

interface ImgixUploadResponse {
  data?: {
    id: string
    attributes: {
      origin_path: string
      date_created: number
    }
  }
  // Fallback for different response formats
  id?: string
  attributes?: {
    origin_path: string
    date_created: number
  }
}

interface ImgixVideoParams {
  w?: number // width
  h?: number // height
  fit?: 'clip' | 'crop' | 'fill' | 'fillmax' | 'max' | 'min' | 'scale'
  auto?: 'compress' | 'format' | 'enhance'
  q?: number // quality (1-100)
  fm?: 'mp4' | 'webm' | 'gif' // format
  loop?: number // loop count
  frame?: number // specific frame
}

class ImgixUploadService {
  private readonly baseUrl = 'https://api.imgix.com/api/v1'
  private apiKey: string
  private sourceId: string
  private domain: string

  constructor() {
    this.apiKey = IMGIX_CONFIG.apiKey
    this.sourceId = IMGIX_CONFIG.sourceId?.trim() // Trim whitespace
    this.domain = IMGIX_CONFIG.domain
    
    // Debug logging to check for whitespace or formatting issues
    console.log('🔧 ImgixUploadService initialized with:', {
      apiKeyLength: this.apiKey?.length,
      apiKeyPrefix: this.apiKey?.substring(0, 3),
      apiKeyValid: this.apiKey?.startsWith('ak_'),
      sourceId: this.sourceId,
      sourceIdLength: this.sourceId?.length,
      sourceIdTrimmed: this.sourceId?.trim(),
      domain: this.domain,
      baseUrl: this.baseUrl
    })
  }

  async uploadFile(
    file: File, 
    fileName: string,
    onProgress?: (progress: number) => void,
    options?: {
      overwrite?: boolean;
      customPath?: string; // e.g., "marketing/logo.png"
    }
  ): Promise<{ assetId: string; originPath: string }> {
    
    console.log('🚀 Starting Imgix upload:', {
      fileName,
      fileSize: file.size,
      fileType: file.type,
      sourceId: this.sourceId,
      domain: this.domain
    })
    
    // Validate configuration
    if (!this.apiKey) {
      throw new Error('Imgix API key not configured. Please set VITE_IMGIX_API_KEY in your .env file.')
    }
    
    if (!this.sourceId) {
      throw new Error('Imgix Source ID not configured. Please set VITE_IMGIX_SOURCE_ID in your .env file.')
    }

    if (!this.domain || this.domain === 'your-domain.imgix.net') {
      throw new Error('Imgix domain not configured. Please set VITE_IMGIX_DOMAIN in your .env file.')
    }

    // Validate API key format
    if (!this.apiKey.startsWith('ak_')) {
      throw new Error('Invalid Imgix API key format. API keys should start with "ak_".')
    }

    // Validate source ID format (should be a hex string, allow dashes)
    const cleanSourceId = this.sourceId.replace(/[-\s]/g, '') // Remove dashes and spaces
    if (!cleanSourceId || !/^[a-f0-9]+$/i.test(cleanSourceId)) {
      throw new Error(`Invalid Imgix Source ID format. Source IDs should be hexadecimal strings. Got: "${this.sourceId}"`)
    }

    try {
      let apiEndpoint: string
      let uploadFileName: string
      
      if (options?.customPath) {
        // Path-based upload with overwrite
        uploadFileName = options.customPath
        apiEndpoint = `${this.baseUrl}/sources/${this.sourceId}/upload/${uploadFileName}?overwrite=true`
        
        console.log('📤 Path-based upload details:', {
          originalFileName: fileName,
          customPath: uploadFileName,
          overwrite: true,
          fileSize: file.size,
          fileType: file.type,
          endpoint: apiEndpoint
        })
      } else {
        // Always overwrite using original filename
        uploadFileName = fileName
        apiEndpoint = `${this.baseUrl}/sources/${this.sourceId}/upload/${uploadFileName}?overwrite=true`
        
        console.log('📤 Original filename upload details:', {
          originalFileName: fileName,
          uploadFileName: uploadFileName,
          overwrite: true,
          fileSize: file.size,
          fileType: file.type,
          endpoint: apiEndpoint
        })
      }
      
      // Start progress simulation
      let progress = 0
      const progressInterval = setInterval(() => {
        progress = Math.min(progress + Math.random() * 15 + 5, 90)
        onProgress?.(progress)
      }, 300)

      try {
        console.log('📤 Uploading to Imgix Management API...', { 
          fileName: uploadFileName,
          sourceId: this.sourceId,
          domain: this.domain,
          apiEndpoint: apiEndpoint,
          fileSize: file.size,
          fileType: file.type,
          overwrite: true,
          mode: options?.customPath ? 'Custom path overwrite' : 'Original filename overwrite'
        })

        // Send the raw file data directly, not as FormData for overwrite endpoints
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': file.type || 'application/octet-stream'
          },
          body: file
        })

        console.log('📡 Upload response received:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries())
        })

        // Get the full response body for debugging
        const responseText = await response.text()
        console.log('📡 Raw upload response:', responseText)

        clearInterval(progressInterval)
        onProgress?.(100)

        if (!response.ok) {
          let errorData
          let errorMessage = `HTTP ${response.status}: ${response.statusText}`
          
          try {
            if (responseText) {
              // Try to parse as JSON first
              try {
                errorData = JSON.parse(responseText)
                errorMessage = JSON.stringify(errorData, null, 2)
              } catch {
                // If not JSON, use raw text
                errorMessage = responseText
              }
            }
          } catch (parseError) {
            errorMessage = `Parse error: ${parseError}`
          }

          throw new Error(`Upload failed (${response.status}): ${errorMessage}`)
        }

        // Parse successful response
        try {
          const uploadResponse: ImgixUploadResponse = JSON.parse(responseText)
          console.log('✅ Imgix upload successful:', uploadResponse)
          
          const assetId = uploadResponse.data?.id || uploadResponse.id
          const originPath = uploadResponse.data?.attributes?.origin_path || uploadResponse.attributes?.origin_path
          
          if (!assetId || !originPath) {
            throw new Error('Invalid upload response: missing asset ID or origin path')
          }
          
          return {
            assetId,
            originPath
          }
        } catch (parseError) {
          console.error('❌ Failed to parse upload response:', parseError)
          throw new Error(`Upload response parse error: ${parseError}`)
        }
      } catch (uploadError) {
        clearInterval(progressInterval)
        console.error('❌ Upload request failed:', uploadError)
        throw uploadError
      }
    } catch (error) {
      console.error('❌ Imgix upload error:', error)
      throw error instanceof Error ? error : new Error(`Unknown upload error: ${error}`)
    }
  }

  generateVideoUrl(originPath: string, params: ImgixVideoParams = {}): string {
    // Default video optimization parameters
    const defaultParams: ImgixVideoParams = {
      auto: 'compress',
      fm: 'mp4',
      q: 80,
      ...params
    }

    const searchParams = new URLSearchParams()
    Object.entries(defaultParams).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.set(key, value.toString())
      }
    })

    const baseUrl = `https://${this.domain}.imgix.net${originPath}`
    return `${baseUrl}?${searchParams.toString()}`
  }

  generateThumbnail(originPath: string, width: number = 320, height: number = 180): string {
    // Use separate params object for thumbnails that allows jpg format
    const thumbnailParams = {
      w: width,
      h: height,
      fit: 'crop' as const,
      fm: 'jpg', // Generate thumbnail as JPEG
      frame: 1, // First frame
      auto: 'format' as const
    }

    const searchParams = new URLSearchParams()
    Object.entries(thumbnailParams).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.set(key, value.toString())
      }
    })

    const baseUrl = `https://${this.domain}.imgix.net${originPath}`
    return `${baseUrl}?${searchParams.toString()}`
  }

  getOptimizedVersions(originPath: string) {
    const baseUrl = `https://${this.domain}.imgix.net${originPath}`
    
    console.log('🎬 Generating video URLs for:', {
      originPath,
      domain: this.domain,
      baseUrl
    })
    
    // Create multiple video variants with different codecs and bitrates
    const videoVariants = [
      {
        name: 'Original (User Upload)',
        url: baseUrl,
        params: 'No parameters - original file',
        codec: 'Original format'
      },
      {
        name: 'H.264 (5M bitrate)',
        url: `${baseUrl}?video-codec=h264&video-bitrate=5M&fm=mp4`,
        params: 'video-codec=h264&video-bitrate=5M&fm=mp4',
        codec: 'H.264',
        bitrate: 5000
      },
      {
        name: 'H.264 (3M bitrate)',
        url: `${baseUrl}?video-codec=h264&video-bitrate=3M&fm=mp4`,
        params: 'video-codec=h264&video-bitrate=3M&fm=mp4',
        codec: 'H.264',
        bitrate: 3000
      },
      {
        name: 'H.264 (1M bitrate)',
        url: `${baseUrl}?video-codec=h264&video-bitrate=1M&fm=mp4`,
        params: 'video-codec=h264&video-bitrate=1M&fm=mp4',
        codec: 'H.264',
        bitrate: 1000
      },
      {
        name: 'H.265 (3M bitrate)',
        url: `${baseUrl}?video-codec=h265&video-bitrate=3M&fm=mp4`,
        params: 'video-codec=h265&video-bitrate=3M&fm=mp4',
        codec: 'H.265/HEVC',
        bitrate: 3000
      },
      {
        name: 'H.265 (1M bitrate)',
        url: `${baseUrl}?video-codec=h265&video-bitrate=1M&fm=mp4`,
        params: 'video-codec=h265&video-bitrate=1M&fm=mp4',
        codec: 'H.265/HEVC',
        bitrate: 1000
      },
      {
        name: 'AV1 (3M bitrate)',
        url: `${baseUrl}?video-codec=av1&video-bitrate=3M&fm=mp4`,
        params: 'video-codec=av1&video-bitrate=3M&fm=mp4',
        codec: 'AV1',
        bitrate: 3000
      },
      {
        name: 'AV1 (1M bitrate)',
        url: `${baseUrl}?video-codec=av1&video-bitrate=1M&fm=mp4`,
        params: 'video-codec=av1&video-bitrate=1M&fm=mp4',
        codec: 'AV1',
        bitrate: 1000
      }
    ]
    
    console.log('📹 Video variants generated:', videoVariants.map(v => ({ name: v.name, url: v.url })))
    
    return {
      thumbnail: this.generateThumbnail(originPath),
      small: this.generateVideoUrl(originPath, { w: 480, h: 270 }),
      medium: this.generateVideoUrl(originPath, { w: 720, h: 405 }),
      large: this.generateVideoUrl(originPath, { w: 1280, h: 720 }),
      original: this.generateVideoUrl(originPath),
      videoVariants
    }
  }
}

export const imgixUploadService = new ImgixUploadService()