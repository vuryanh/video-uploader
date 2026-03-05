import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { AWS_CONFIG } from '../config'

class S3Service {
  private s3Client: S3Client

  constructor() {
    this.s3Client = new S3Client({
      region: AWS_CONFIG.region,
      credentials: {
        accessKeyId: AWS_CONFIG.accessKeyId,
        secretAccessKey: AWS_CONFIG.secretAccessKey
      }
    })
  }

  async uploadFile(
    file: File, 
    fileName: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    const key = `videos/${Date.now()}-${fileName}`
    
    console.log('🚀 Starting S3 upload:', {
      fileName,
      fileSize: file.size,
      fileType: file.type,
      key,
      bucket: AWS_CONFIG.bucket,
      region: AWS_CONFIG.region
    })
    
    try {
      // Validate configuration
      if (!AWS_CONFIG.accessKeyId || !AWS_CONFIG.secretAccessKey) {
        throw new Error('AWS credentials not configured. Please check your .env file.')
      }
      
      if (!AWS_CONFIG.bucket || AWS_CONFIG.bucket === 'your-video-bucket') {
        throw new Error('S3 bucket not configured. Please set VITE_S3_BUCKET in your .env file.')
      }

      // Convert File to ArrayBuffer for better browser compatibility
      console.log('📄 Converting file to ArrayBuffer...')
      const arrayBuffer = await file.arrayBuffer()
      
      const command = new PutObjectCommand({
        Bucket: AWS_CONFIG.bucket,
        Key: key,
        Body: new Uint8Array(arrayBuffer),
        ContentType: file.type,
        Metadata: {
          'original-name': fileName,
          'upload-date': new Date().toISOString()
        }
      })

      console.log('📤 Sending S3 command...', { bucket: AWS_CONFIG.bucket, key })

      // Start progress simulation
      let progress = 0
      const progressInterval = setInterval(() => {
        progress = Math.min(progress + Math.random() * 15 + 5, 95)
        onProgress?.(progress)
      }, 300)

      try {
        await this.s3Client.send(command)
        clearInterval(progressInterval)
        onProgress?.(100)
        
        console.log('✅ S3 upload successful:', { key, bucket: AWS_CONFIG.bucket })
        return key
      } catch (uploadError) {
        clearInterval(progressInterval)
        throw uploadError
      }
      
    } catch (error: any) {
      console.error('❌ S3 upload failed:', {
        error: error.message,
        code: error.Code || error.code,
        statusCode: error.$metadata?.httpStatusCode,
        requestId: error.$metadata?.requestId,
        bucket: AWS_CONFIG.bucket,
        key,
        region: AWS_CONFIG.region
      })
      
      // Provide user-friendly error messages
      if (error.Code === 'NoSuchBucket' || error.code === 'NoSuchBucket') {
        throw new Error(`S3 Bucket "${AWS_CONFIG.bucket}" does not exist or is not accessible.`)
      } else if (error.Code === 'AccessDenied' || error.code === 'AccessDenied') {
        throw new Error('Access denied. Check your AWS credentials and bucket permissions.')
      } else if (error.Code === 'InvalidAccessKeyId' || error.code === 'InvalidAccessKeyId') {
        throw new Error('Invalid AWS Access Key ID. Please check your credentials.')
      } else if (error.Code === 'SignatureDoesNotMatch' || error.code === 'SignatureDoesNotMatch') {
        throw new Error('Invalid AWS Secret Key. Please check your credentials.')
      } else if (error.message?.includes('CORS')) {
        throw new Error('CORS error: Please configure CORS policy on your S3 bucket.')
      } else {
        throw new Error(`Upload failed: ${error.message || 'Unknown error'}`)
      }
    }
  }

  async getPresignedUrl(key: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: AWS_CONFIG.bucket,
      Key: key
    })
    
    return await getSignedUrl(this.s3Client, command, { expiresIn: 3600 })
  }
}

export const s3Service = new S3Service()