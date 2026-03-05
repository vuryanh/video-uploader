import { IMGIX_CONFIG } from '../config'

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

class ImgixService {
  private domain: string
  // Note: secureToken would be used for signing URLs in production
  // private secureToken: string

  constructor() {
    this.domain = IMGIX_CONFIG.domain
    // this.secureToken = IMGIX_CONFIG.secureUrlToken
  }

  generateVideoUrl(s3Key: string, params: ImgixVideoParams = {}): string {
    // Default video optimization parameters
    const defaultParams: ImgixVideoParams = {
      auto: 'compress',
      fm: 'mp4',
      q: 80,
      ...params
    }

    const queryParams = new URLSearchParams()
    Object.entries(defaultParams).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString())
      }
    })

    // Ensure domain has proper format
    const domain = this.domain.includes('.imgix.net') ? this.domain : `${this.domain}.imgix.net`
    const baseUrl = `https://${domain}/${s3Key}`
    const urlWithParams = `${baseUrl}?${queryParams.toString()}`

    console.log('🖼️ Generated Imgix URL:', { s3Key, domain, url: urlWithParams })

    // Note: In production, you should sign URLs with secure token
    // For now, returning unsigned URL for demo purposes
    return urlWithParams
  }

  generateThumbnail(s3Key: string, width: number = 320, height: number = 180): string {
    return this.generateVideoUrl(s3Key, {
      w: width,
      h: height,
      fit: 'crop',
      frame: 1, // First frame as thumbnail
      fm: 'jpg' as any
    })
  }

  getOptimizedVersions(s3Key: string) {
    return {
      thumbnail: this.generateThumbnail(s3Key),
      small: this.generateVideoUrl(s3Key, { w: 480, h: 270 }),
      medium: this.generateVideoUrl(s3Key, { w: 720, h: 405 }),
      large: this.generateVideoUrl(s3Key, { w: 1280, h: 720 }),
      original: this.generateVideoUrl(s3Key)
    }
  }
}

export const imgixService = new ImgixService()