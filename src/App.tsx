import { useState, useCallback } from 'react'
import './App.css'
import { imgixUploadService } from './services/imgixUploadService'
import { IMGIX_CONFIG } from './config'

interface VideoVariant {
  name: string
  url: string
  params: string
  codec: string
  bitrate?: number
  size?: number
  metadata?: {
    codec?: string
    bitrate?: number
    resolution?: string
    duration?: number
    fileFormat?: string
    containerFormat?: string
  }
}

interface UploadedFile {
  file: File
  id: string
  progress: number
  status: 'uploading' | 'analyzing' | 'completed' | 'error'
  assetId?: string
  originPath?: string
  imgixUrls?: {
    thumbnail: string
    small: string
    medium: string
    large: string
    original: string
  }
  videoVariants?: VideoVariant[]
  variantProgress?: { [key: string]: number }
  processingStage?: 'upload' | 'generating' | 'analyzing'
  originalAnalyzed?: boolean
  error?: string
}

function App() {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isDragOver, setIsDragOver] = useState(false)

  // Enhanced function to get video metadata including codec detection
  const getVideoMetadata = async (url: string, isOriginal = false, originalFile?: File): Promise<{
    codec?: string
    bitrate?: number
    resolution?: string
    duration?: number
    fileFormat?: string
    containerFormat?: string
  }> => {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.crossOrigin = 'anonymous'
      video.preload = 'metadata'
      
      const timeout = setTimeout(() => {
        resolve({})
      }, 15000) // Longer timeout for codec detection
      
      video.addEventListener('loadedmetadata', async () => {
        clearTimeout(timeout)
        
        const metadata = {
          resolution: `${video.videoWidth}x${video.videoHeight}`,
          duration: Math.round(video.duration || 0),
          bitrate: undefined as number | undefined,
          codec: undefined as string | undefined,
          fileFormat: undefined as string | undefined,
          containerFormat: undefined as string | undefined
        }
        
        // For original files, try to detect codec from file headers and metadata
        if (isOriginal && originalFile) {
          try {
            const arrayBuffer = await originalFile.slice(0, 16384).arrayBuffer()
            const uint8Array = new Uint8Array(arrayBuffer)
            
            // H.264 detection patterns
            const h264Patterns = [
              [0x00, 0x00, 0x00, 0x01, 0x67], // H.264 SPS
              [0x00, 0x00, 0x01, 0x67], // H.264 SPS short
            ]
            
            // H.265/HEVC detection patterns  
            const h265Patterns = [
              [0x00, 0x00, 0x00, 0x01, 0x40], // H.265 VPS
              [0x00, 0x00, 0x01, 0x40], // H.265 VPS short
            ]
            
            // Check for H.264
            for (const pattern of h264Patterns) {
              for (let i = 0; i <= uint8Array.length - pattern.length; i++) {
                if (pattern.every((byte, index) => uint8Array[i + index] === byte)) {
                  metadata.codec = 'H.264/AVC'
                  break
                }
              }
              if (metadata.codec) break
            }
            
            // Check for H.265 if H.264 not found
            if (!metadata.codec) {
              for (const pattern of h265Patterns) {
                for (let i = 0; i <= uint8Array.length - pattern.length; i++) {
                  if (pattern.every((byte, index) => uint8Array[i + index] === byte)) {
                    metadata.codec = 'H.265/HEVC'
                    break
                  }
                }
                if (metadata.codec) break
              }
            }
            
            // Estimate bitrate from file size and duration
            if (video.duration > 0) {
              const estimatedBitrate = Math.round((originalFile.size * 8) / (video.duration * 1024))
              metadata.bitrate = estimatedBitrate
            }
            
            // Detect container format from file extension
            const extension = originalFile.name.toLowerCase().split('.').pop()
            switch (extension) {
              case 'mp4':
                metadata.containerFormat = 'MP4'
                metadata.fileFormat = 'MP4'
                break
              case 'mov':
                metadata.containerFormat = 'QuickTime'
                metadata.fileFormat = 'MOV'
                break
              case 'avi':
                metadata.containerFormat = 'AVI'
                metadata.fileFormat = 'AVI'
                break
              case 'mkv':
                metadata.containerFormat = 'Matroska'
                metadata.fileFormat = 'MKV'
                break
              case 'webm':
                metadata.containerFormat = 'WebM'
                metadata.fileFormat = 'WebM'
                break
              default:
                metadata.containerFormat = 'Unknown'
                metadata.fileFormat = extension?.toUpperCase() || 'Unknown'
            }
            
          } catch (error) {
            console.log('Could not analyze file headers:', error)
          }
        }
        
        resolve(metadata)
      })
      
      video.addEventListener('error', () => {
        clearTimeout(timeout)
        resolve({})
      })
      
      video.src = url
    })
  }

  // Function to format file sizes
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Progressive analysis function
  const analyzeVideoVariantsProgressively = async (uploadedFileId: string, originPath: string, originalVideoUrl: string, originalFile: File) => {
    console.log('Starting progressive video analysis for:', originalFile.name)
    
    // Update processing stage 
    setFiles(prev => prev.map(f => 
      f.id === uploadedFileId 
        ? { ...f, processingStage: 'analyzing' }
        : f
    ))
    
    // First, analyze the original video if not done yet
    const currentFile = files.find(f => f.id === uploadedFileId)
    if (!currentFile?.originalAnalyzed) {
      console.log('Analyzing original video metadata...')
      try {
        const originalMetadata = await getVideoMetadata(originalVideoUrl, true, originalFile)
        console.log('Original video metadata:', originalMetadata)
        
        // Create original video variant
        const originalVariant: VideoVariant = {
          name: 'Original',
          url: originalVideoUrl,
          params: '', // No transformations for original
          codec: 'Original',
          bitrate: originalMetadata.bitrate,
          size: originalFile.size,
          metadata: originalMetadata
        }
        
        setFiles(prev => prev.map(f => 
          f.id === uploadedFileId 
            ? { 
                ...f, 
                videoVariants: [originalVariant],
                originalAnalyzed: true,
                processingStage: 'generating'
              }
            : f
        ))
        
        console.log('Original analysis complete, starting variant generation...')
      } catch (error) {
        console.error('Error analyzing original video:', error)
      }
    }
    
    // Define all the variants to generate
    const variantConfigs: Array<{ name: string; codec?: string; bitrate?: string }> = [
      { name: 'Format MP4', codec: undefined, bitrate: undefined }, // Format conversion only
      { name: 'H.264 1M', codec: 'h264', bitrate: '1M' },
      { name: 'H.264 3M', codec: 'h264', bitrate: '3M' },  
      { name: 'H.264 5M', codec: 'h264', bitrate: '5M' },
      { name: 'H.265 1M', codec: 'h265', bitrate: '1M' },
      { name: 'H.265 3M', codec: 'h265', bitrate: '3M' },
      { name: 'H.265 5M', codec: 'h265', bitrate: '5M' },
      { name: 'AV1 1M', codec: 'av1', bitrate: '1M' },
      { name: 'AV1 5M', codec: 'av1', bitrate: '5M' },
      { name: 'AV1 3M', codec: 'av1', bitrate: '3M' }
    ]
    
    console.log(`Generating ${variantConfigs.length} video variants...`)
    
    // Process variants in batches of 2 for better performance
    const batchSize = 2
    for (let i = 0; i < variantConfigs.length; i += batchSize) {
      const batch = variantConfigs.slice(i, i + batchSize)
      
      const batchPromises = batch.map(async (config) => {
        try {
          console.log(`Processing variant: ${config.name}`)
          
          // Update progress for this variant
          setFiles(prev => prev.map(f => 
            f.id === uploadedFileId 
              ? { 
                  ...f, 
                  variantProgress: { 
                    ...(f.variantProgress || {}), 
                    [config.name]: 25 
                  }
                }
              : f
          ))
          
          const params = config.codec && config.bitrate 
            ? `fm=mp4&video-codec=${config.codec}&video-bitrate=${config.bitrate}`
            : 'fm=mp4'
          const variantUrl = `https://${IMGIX_CONFIG.domain}${originPath.startsWith('/') ? originPath : '/' + originPath}?${params}`
          
          // Simulate processing time for demo
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          setFiles(prev => prev.map(f => 
            f.id === uploadedFileId 
              ? { 
                  ...f, 
                  variantProgress: { 
                    ...(f.variantProgress || {}), 
                    [config.name]: 75 
                  }
                }
              : f
          ))
          
          // Get metadata for this variant
          const variantMetadata = await getVideoMetadata(variantUrl)
          console.log(`Variant ${config.name} metadata:`, variantMetadata)
          
          // Try to get actual file size
          let variantSize: number | undefined
          try {
            const sizeResponse = await fetch(variantUrl, { method: 'HEAD' })
            const contentLength = sizeResponse.headers.get('content-length')
            if (contentLength) {
              variantSize = parseInt(contentLength, 10)
            }
          } catch (error) {
            console.log(`Could not get size for ${config.name}:`, error)
          }
          
          const variant: VideoVariant = {
            name: config.name,
            url: variantUrl,
            params,
            codec: config.codec ? config.codec.toUpperCase() : 'MP4',
            bitrate: config.bitrate ? parseInt(config.bitrate.replace('M', '')) * 1000 : undefined, // Convert to kbps
            size: variantSize,
            metadata: variantMetadata
          }
          
          // Add this variant to the file
          setFiles(prev => prev.map(f => 
            f.id === uploadedFileId 
              ? { 
                  ...f, 
                  videoVariants: [...(f.videoVariants || []), variant],
                  variantProgress: { 
                    ...(f.variantProgress || {}), 
                    [config.name]: 100 
                  }
                }
              : f
          ))
          
          console.log(`Completed variant: ${config.name}`)
          
        } catch (error) {
          console.error(`Error processing variant ${config.name}:`, error)
        }
      })
      
      await Promise.all(batchPromises)
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    console.log('All video variants generated successfully!')
    
    // Mark analysis as complete
    setFiles(prev => prev.map(f => 
      f.id === uploadedFileId 
        ? { ...f, processingStage: 'analyzing', status: 'completed' }
        : f
    ))
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter(file => 
      file.type.startsWith('video/')
    )
    
    // Add all files to state first, then upload in parallel
    const fileIds: string[] = []
    droppedFiles.forEach(file => {
      const fileId = `${Date.now()}-${Math.random().toString(36).substring(2)}`
      fileIds.push(fileId)
      
      const uploadedFile: UploadedFile = {
        file,
        id: fileId,
        progress: 0,
        status: 'uploading',
        processingStage: 'upload'
      }
      
      setFiles(prev => [...prev, uploadedFile])
    })
    
    // Upload files in parallel
    const uploadPromises = droppedFiles.map((file, index) => 
      uploadFile(file, fileIds[index])
    )
    
    await Promise.all(uploadPromises)
  }, [])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []).filter(file => 
      file.type.startsWith('video/')
    )
    
    // Add all files to state first, then upload in parallel
    const fileIds: string[] = []
    selectedFiles.forEach(file => {
      const fileId = `${Date.now()}-${Math.random().toString(36).substring(2)}`
      fileIds.push(fileId)
      
      const uploadedFile: UploadedFile = {
        file,
        id: fileId,
        progress: 0,
        status: 'uploading',
        processingStage: 'upload'
      }
      
      setFiles(prev => [...prev, uploadedFile])
    })
    
    // Upload files in parallel
    const uploadPromises = selectedFiles.map((file, index) => 
      uploadFile(file, fileIds[index])
    )
    
    await Promise.all(uploadPromises)
    
    // Reset input
    e.target.value = ''
  }, [])

  const uploadFile = async (file: File, existingFileId?: string) => {
    const fileId = existingFileId || `${Date.now()}-${Math.random().toString(36).substring(2)}`
    
    // Add file to state only if not already added
    if (!existingFileId) {
      const uploadedFile: UploadedFile = {
        file,
        id: fileId,
        progress: 0,
        status: 'uploading',
        processingStage: 'upload'
      }
      
      setFiles(prev => [...prev, uploadedFile])
    }
    
    try {
      console.log(`Starting upload for: ${file.name}`)
      
      // Upload to Imgix
      const result = await imgixUploadService.uploadFile(
        file,
        file.name,
        (progress: number) => {
          setFiles(prev => prev.map(f => 
            f.id === fileId ? { ...f, progress } : f
          ))
        }
      )
      
      console.log('Upload result:', result)
      
      if (result.assetId && result.originPath) {
        const { assetId, originPath } = result
        
        // Create initial Imgix URLs using the configured domain and originPath
        const baseUrl = `https://${IMGIX_CONFIG.domain}${originPath.startsWith('/') ? originPath : '/' + originPath}`
        const rawUrl = baseUrl // Original without any transformations
        console.log('Generated base URL:', baseUrl)
        console.log('Using domain:', IMGIX_CONFIG.domain)
        console.log('Origin path:', originPath)
        
        const imgixUrls = {
          thumbnail: `${baseUrl}?fm=jpg&w=200&h=150&fit=crop&crop=smart`,
          small: `${baseUrl}?fm=mp4&w=480`,
          medium: `${baseUrl}?fm=mp4&w=720`,
          large: `${baseUrl}?fm=mp4&w=1080`,
          original: rawUrl
        }
        
        console.log('Generated video URLs:', imgixUrls)
        
        setFiles(prev => prev.map(f => 
          f.id === fileId 
            ? { 
                ...f, 
                progress: 100,
                status: 'analyzing',
                assetId,
                originPath,
                imgixUrls
              }
            : f
        ))
        
        console.log(`Upload complete for: ${file.name}, starting analysis...`)
        
        // Start progressive video analysis
        await analyzeVideoVariantsProgressively(fileId, originPath, imgixUrls.original, file)
        
      } else {
        throw new Error('Upload failed - missing asset ID or origin path')
      }
    } catch (error) {
      console.error('Upload error:', error)
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { 
          ...f, 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Upload failed' 
        } : f
      ))
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Imgix Video Codec Comparisons</h1>
        <p>Upload videos to analyze and compare H.264, H.265, and AV1 codec performance across multiple bitrates. See real-time file sizes, compression ratios, and quality differences powered by Imgix's video processing API.</p>
        <p style={{ fontSize: '0.9rem', color: 'rgb(200, 210, 220)', marginTop: '0.5rem' }}>
          <strong>Device Compatibility:</strong> H.264 works on all devices (iPhones, Android, smart TVs, older browsers). H.265 is supported by iPhone 7+, modern Android phones, 4K TVs, and Apple TV. AV1 is optimized for latest Chrome/Firefox browsers, newer smart TVs, and next-gen streaming devices.
        </p>
        <p style={{ fontSize: '0.9rem', color: 'rgb(200, 210, 220)', marginTop: '0.5rem' }}>
          <strong>Video Srcset Optimization:</strong> Use multiple codec sources in your HTML video element to optimize delivery by up to 34%. List AV1 first (most efficient), then H.265 (better compression), then H.264 (universal fallback). Browsers automatically select the best supported format for optimal performance and smaller file sizes. <a href="https://docs.imgix.com/en-US/getting-started/tutorials/performance-and-metadata/creating-a-user-friendly-video-player#optimizing-with-codec-based-source-sets" target="_blank" rel="noopener noreferrer" style={{ color: '#59BB91' }}>Learn more about codec-based source sets</a>.
        </p>
      </header>

      <div 
        className={`upload-zone ${isDragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => document.getElementById('fileInput')?.click()}
      >
        <div className="upload-content">
          <div className="upload-icon">Upload</div>
          <h3>Drop video files here or click to select</h3>
          <p>Supports MP4, MOV, AVI, and other video formats</p>
          
          {files.some(f => f.status === 'uploading' || f.status === 'analyzing') && (
            <div style={{ 
              marginTop: '20px', 
              padding: '15px', 
              backgroundColor: '#1E1E23', 
              borderRadius: '8px', 
              border: '1px solid #207593' 
            }}>
              <p style={{ color: '#FFB824', margin: '0 0 10px 0', fontWeight: 'bold' }}>
                Processing {files.filter(f => f.status === 'uploading' || f.status === 'analyzing').length} video{files.filter(f => f.status === 'uploading' || f.status === 'analyzing').length > 1 ? 's' : ''}
              </p>
              <p style={{ color: 'rgb(241, 245, 249)', margin: 0, fontSize: '0.9rem' }}>
                Analysis typically takes 2-3 minutes per video.<br/>
                Check back shortly for codec comparison results.
              </p>
            </div>
          )}
          
          <input
            id="fileInput"
            type="file"
            multiple
            accept="video/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {files.length > 0 && (
        <div className="files-section">
          <h2>Uploaded Files ({files.length})</h2>
          <div className="files-list">
            {files
              .sort((a, b) => {
                // Put mamari2.mp4 at the top
                if (a.file.name === 'mamari2.mp4') return -1
                if (b.file.name === 'mamari2.mp4') return 1
                return 0 // Keep original order for other files
              })
              .map(file => (
                <div key={file.id} className="file-item">
                  <div className="file-header">
                    <div className="file-info">
                      <span className="file-name">{file.file.name}</span>
                      <span className="file-size">({formatFileSize(file.file.size)})</span>
                    </div>
                    <div className="file-status">
                      <div className="status-indicator">
                        {file.status === 'uploading' && (
                          <>
                            <div className="progress-ring">
                              <svg width="20" height="20">
                                <circle cx="10" cy="10" r="8" stroke="#e1e5e9" strokeWidth="2" fill="none"/>
                                <circle 
                                  cx="10" cy="10" r="8" 
                                  stroke="#59BB91" 
                                  strokeWidth="2" 
                                  fill="none"
                                  strokeDasharray={`${2 * Math.PI * 8}`}
                                  strokeDashoffset={`${2 * Math.PI * 8 * (1 - file.progress / 100)}`}
                                  style={{ transition: 'stroke-dashoffset 0.2s ease' }}
                                />
                              </svg>
                            </div>
                            <span className="status-text">Uploading {Math.round(file.progress)}%</span>
                          </>
                        )}
                        {file.status === 'analyzing' && (
                          <>
                            <div className="progress-ring analyzing">
                              <svg width="20" height="20">
                                <circle cx="10" cy="10" r="8" stroke="#e1e5e9" strokeWidth="2" fill="none"/>
                                <circle 
                                  cx="10" cy="10" r="8" 
                                  stroke="#ffc107" 
                                  strokeWidth="2" 
                                  fill="none"
                                  strokeDasharray={`${2 * Math.PI * 8}`}
                                  className="analyzing-circle"
                                />
                              </svg>
                            </div>
                            <span className="status-text">
                              {file.processingStage === 'upload' && 'Uploading...'}
                              {file.processingStage === 'generating' && 'Generating variants...'}
                              {file.processingStage === 'analyzing' && 'Analyzing videos...'}
                            </span>
                          </>
                        )}
                        {file.status === 'completed' && (
                          <span className="status-text">Analysis Complete</span>
                        )}
                        {file.status === 'error' && (
                          <>
                            <div className="error-indicator">Error</div>
                            <span className="status-text error">Error</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Video Variants Comparison Section */}
                  {file.videoVariants && file.videoVariants.length > 0 && (
                    <div className="video-variants-comparison" style={{
                      marginTop: '15px',
                      padding: '15px',
                      border: '1px solid #207593',
                      borderRadius: '8px',
                      backgroundColor: '#1E1E23'
                    }}>
                      <h4 style={{ margin: '0 0 15px 0', fontSize: '1.6rem', fontWeight: 'bold', color: 'rgb(241, 245, 249)' }}>
                        Imgix Video Codec & Bitrate Analysis
                      </h4>
                      
                      {/* Codec-Based Row Layout: Each codec gets its own row */}
                      <div style={{ marginTop: '20px' }}>
                        {/* Original Video Section */}
                        {file.videoVariants?.length > 0 && (
                          <div style={{ marginBottom: '24px' }}>
                            <h5 style={{ margin: '0 0 15px 0', fontSize: '14px', fontWeight: 'bold', color: 'rgb(241, 245, 249)' }}>
                              Original Video Analysis
                            </h5>
                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                              gap: '16px'
                            }}>
                              {/* Original Video */}
                              <div style={{
                                border: '2px solid #59BB91',
                                borderRadius: '8px',
                                padding: '12px',
                                backgroundColor: '#1E1E23'
                              }}>
                                <video
                                  src={file.videoVariants[0].url}
                                  controls
                                  style={{
                                    width: '100%',
                                    height: 'auto',
                                    aspectRatio: '16/9',
                                    objectFit: 'contain',
                                    borderRadius: '6px',
                                    marginBottom: '8px'
                                  }}
                                />
                                <div style={{ fontSize: '12px', color: 'rgb(241 245 249)' }}>
                                  <div><strong>{file.videoVariants[0].name}</strong></div>
                                  {file.videoVariants[0].metadata && (
                                    <div style={{ marginTop: '4px' }}>
                                      {file.videoVariants[0].metadata.resolution && (
                                        <div>Resolution: {file.videoVariants[0].metadata.resolution}</div>
                                      )}
                                      {file.videoVariants[0].metadata.containerFormat && (
                                        <div>Container: {file.videoVariants[0].metadata.containerFormat}</div>
                                      )}
                                      {file.videoVariants[0].metadata.codec && (
                                        <div>Codec: {file.videoVariants[0].metadata.codec}</div>
                                      )}
                                      {file.videoVariants[0].metadata.bitrate && (
                                        <div>Bitrate: {file.videoVariants[0].metadata.bitrate.toLocaleString()} kbps</div>
                                      )}
                                      {file.videoVariants[0].metadata.duration && (
                                        <div>Duration: {file.videoVariants[0].metadata.duration}s</div>
                                      )}
                                      {file.videoVariants[0].size && (
                                        <div>Size: {formatFileSize(file.videoVariants[0].size)}</div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              {/* Format MP4 Variant */}
                              {(() => {
                                const formatMp4Variant = file.videoVariants.find(v => v.name === 'Format MP4')
                                return formatMp4Variant && (
                                  <div style={{
                                    border: '1px solid #59BB91',
                                    borderRadius: '8px',
                                    padding: '12px',
                                    backgroundColor: '#1E1E23'
                                  }}>
                                    <h6 style={{ margin: '0 0 8px 0', fontSize: '11px', fontWeight: 'bold', color: 'rgb(241, 245, 249)' }}>
                                      {formatMp4Variant.name}
                                      {file.variantProgress && file.variantProgress[formatMp4Variant.name] === 100 && (
                                        <span style={{ color: '#10b981', marginLeft: '4px', display: 'inline-block', transform: 'rotate(0deg)' }}>Done</span>
                                      )}
                                    </h6>
                                    
                                    {file.variantProgress && file.variantProgress[formatMp4Variant.name] < 100 ? (
                                      <div className="skeleton-video" style={{
                                        width: '100%',
                                        aspectRatio: '16/9',
                                        backgroundColor: '#1E1E23',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '12px',
                                        color: 'rgb(241, 245, 249)',
                                        marginBottom: '8px',
                                        position: 'relative',
                                        overflow: 'hidden'
                                      }}>
                                        <div className="shimmer"></div>
                                        <span style={{ position: 'relative', zIndex: 1 }}>
                                          Processing... {Math.round(file.variantProgress[formatMp4Variant.name] || 0)}%
                                        </span>
                                      </div>
                                    ) : (
                                      <video
                                        src={formatMp4Variant.url}
                                        controls
                                        style={{
                                          width: '100%',
                                          height: 'auto',
                                          aspectRatio: '16/9',
                                          objectFit: 'contain',
                                          borderRadius: '4px',
                                          marginBottom: '8px'
                                        }}
                                      />
                                    )}
                                    
                                    <div style={{ fontSize: '11px', color: 'rgb(241 245 249)' }}>
                                      <div><strong>Format: {formatMp4Variant.codec}</strong></div>
                                      <div>Bitrate: {formatMp4Variant.metadata?.bitrate ? formatMp4Variant.metadata.bitrate.toLocaleString() + ' kbps' : 'Analyzing...'}</div>
                                      <div>URL: <a href={formatMp4Variant.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '10px', wordBreak: 'break-all', color: '#59BB91' }}>{formatMp4Variant.url}</a></div>
                                      {formatMp4Variant.size && (
                                        <div>Size: {formatFileSize(formatMp4Variant.size)}</div>
                                      )}
                                    </div>
                                  </div>
                                )
                              })()}
                            </div>
                          </div>
                        )}
                        
                        {/* H.264 Codec Row */}
                        {(() => {
                          const h264Variants = file.videoVariants?.filter(v => v.name.startsWith('H.264')) || []
                          return h264Variants.length > 0 && (
                            <div style={{ marginBottom: '24px' }}>
                              <h5 style={{ margin: '0 0 15px 0', fontSize: '14px', fontWeight: 'bold', color: 'rgb(241, 245, 249)' }}>
                                H.264 Codec Analysis
                              </h5>
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                gap: '12px'
                              }}>
                                {h264Variants.map((variant, index) => (
                                  <div key={`h264-${index}`} style={{
                                    border: '1px solid #FF3C00',
                                    borderRadius: '6px',
                                    padding: '10px',
                                    backgroundColor: '#1E1E23'
                                  }}>
                                    <h6 style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 'bold', color: 'rgb(241, 245, 249)' }}>
                                      {variant.name}
                                      {file.variantProgress && file.variantProgress[variant.name] === 100 && (
                                        <span style={{ color: '#10b981', marginLeft: '4px', display: 'inline-block', transform: 'rotate(0deg)' }}>Done</span>
                                      )}
                                    </h6>
                                    
                                    {file.variantProgress && file.variantProgress[variant.name] < 100 ? (
                                      <div className="skeleton-video" style={{
                                        width: '100%',
                                        aspectRatio: '16/9',
                                        backgroundColor: '#1E1E23',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '12px',
                                        color: 'rgb(241, 245, 249)',
                                        marginBottom: '8px',
                                        position: 'relative',
                                        overflow: 'hidden'
                                      }}>
                                        <div className="shimmer"></div>
                                        <span style={{ position: 'relative', zIndex: 1 }}>
                                          Processing... {Math.round(file.variantProgress[variant.name] || 0)}%
                                        </span>
                                      </div>
                                    ) : (
                                      <video
                                        src={variant.url}
                                        controls
                                        style={{
                                          width: '100%',
                                          height: 'auto',
                                          aspectRatio: '16/9',
                                          objectFit: 'contain',
                                          borderRadius: '4px',
                                          marginBottom: '8px'
                                        }}
                                      />
                                    )}
                                    
                                    <div style={{ fontSize: '11px', color: 'rgb(241, 245, 249)' }}>
                                      <div><strong>Codec: {variant.codec}</strong></div>
                                      <div>Target: {variant.bitrate?.toLocaleString() || 'N/A'} kbps</div>
                                      <div>URL: <a href={variant.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '10px', wordBreak: 'break-all', color: '#59BB91' }}>{variant.url}</a></div>
                                      {variant.size && (
                                        <div>Size: {formatFileSize(variant.size)}</div>
                                      )}
                                      {variant.metadata && variant.metadata.bitrate && (
                                        <div style={{
                                          marginTop: '4px',
                                          padding: '2px 4px',
                                          backgroundColor: '#1E1E23',
                                          borderRadius: '2px',
                                          fontSize: '10px'
                                        }}>
                                          Accuracy: {Math.abs(((variant.metadata.bitrate - variant.bitrate!) / variant.bitrate! * 100)).toFixed(1)}% {Math.abs(variant.metadata.bitrate - variant.bitrate!) < variant.bitrate! * 0.1 ? 'Good' : 'Fair'}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })()}
                        
                        {/* H.265 Codec Row */}
                        {(() => {
                          const h265Variants = file.videoVariants?.filter(v => v.name.startsWith('H.265')) || []
                          return h265Variants.length > 0 && (
                            <div style={{ marginBottom: '24px' }}>
                              <h5 style={{ margin: '0 0 15px 0', fontSize: '14px', fontWeight: 'bold', color: 'rgb(241, 245, 249)' }}>
                                H.265 Codec Analysis
                              </h5>
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                gap: '12px'
                              }}>
                                {h265Variants.map((variant, index) => (
                                  <div key={`h265-${index}`} style={{
                                    border: '1px solid #FFB824',
                                    borderRadius: '6px',
                                    padding: '10px',
                                    backgroundColor: '#1E1E23'
                                  }}>
                                    <h6 style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 'bold', color: 'rgb(241, 245, 249)' }}>
                                      {variant.name}
                                      {file.variantProgress && file.variantProgress[variant.name] === 100 && (
                                        <span style={{ color: '#10b981', marginLeft: '4px', display: 'inline-block', transform: 'rotate(0deg)' }}>Done</span>
                                      )}
                                    </h6>
                                    
                                    {file.variantProgress && file.variantProgress[variant.name] < 100 ? (
                                      <div className="skeleton-video" style={{
                                        width: '100%',
                                        aspectRatio: '16/9',
                                        backgroundColor: '#1E1E23',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '12px',
                                        color: 'rgb(241, 245, 249)',
                                        marginBottom: '8px',
                                        position: 'relative',
                                        overflow: 'hidden'
                                      }}>
                                        <div className="shimmer"></div>
                                        <span style={{ position: 'relative', zIndex: 1 }}>
                                          Processing... {Math.round(file.variantProgress[variant.name] || 0)}%
                                        </span>
                                      </div>
                                    ) : (
                                      <video
                                        src={variant.url}
                                        controls
                                        style={{
                                          width: '100%',
                                          height: 'auto',
                                          aspectRatio: '16/9',
                                          objectFit: 'contain',
                                          borderRadius: '4px',
                                          marginBottom: '8px'
                                        }}
                                      />
                                    )}
                                    
                                    <div style={{ fontSize: '11px', color: 'rgb(241, 245, 249)' }}>
                                      <div><strong>Codec: {variant.codec}</strong></div>
                                      <div>Target: {variant.bitrate?.toLocaleString() || 'N/A'} kbps</div>
                                      <div>URL: <a href={variant.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '10px', wordBreak: 'break-all', color: '#59BB91' }}>{variant.url}</a></div>
                                      {variant.size && (
                                        <div>Size: {formatFileSize(variant.size)}</div>
                                      )}
                                      {variant.metadata && variant.metadata.bitrate && (
                                        <div style={{
                                          marginTop: '4px',
                                          padding: '2px 4px',
                                          backgroundColor: '#1E1E23',
                                          borderRadius: '2px',
                                          fontSize: '10px'
                                        }}>
                                          Accuracy: {Math.abs(((variant.metadata.bitrate - variant.bitrate!) / variant.bitrate! * 100)).toFixed(1)}% {Math.abs(variant.metadata.bitrate - variant.bitrate!) < variant.bitrate! * 0.1 ? 'Good' : 'Fair'}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })()}
                        
                        {/* AV1 Codec Row */}
                        {(() => {
                          const av1Variants = file.videoVariants?.filter(v => v.name.startsWith('AV1')) || []
                          return av1Variants.length > 0 && (
                            <div style={{ marginBottom: '24px' }}>
                              <h5 style={{ margin: '0 0 15px 0', fontSize: '14px', fontWeight: 'bold', color: 'rgb(241, 245, 249)' }}>
                                AV1 Codec Analysis
                              </h5>
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                gap: '12px'
                              }}>
                                {av1Variants.map((variant, index) => (
                                  <div key={`av1-${index}`} style={{
                                    border: '1px solid #59BB91',
                                    borderRadius: '6px',
                                    padding: '10px',
                                    backgroundColor: '#1E1E23'
                                  }}>
                                    <h6 style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 'bold', color: 'rgb(241, 245, 249)' }}>
                                      {variant.name}
                                      {file.variantProgress && file.variantProgress[variant.name] === 100 && (
                                        <span style={{ color: '#10b981', marginLeft: '4px', display: 'inline-block', transform: 'rotate(0deg)' }}>Done</span>
                                      )}
                                    </h6>
                                    
                                    {file.variantProgress && file.variantProgress[variant.name] < 100 ? (
                                      <div className="skeleton-video" style={{
                                        width: '100%',
                                        aspectRatio: '16/9',
                                        backgroundColor: '#1E1E23',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '12px',
                                        color: 'rgb(241, 245, 249)',
                                        marginBottom: '8px',
                                        position: 'relative',
                                        overflow: 'hidden'
                                      }}>
                                        <div className="shimmer"></div>
                                        <span style={{ position: 'relative', zIndex: 1 }}>
                                          Processing... {Math.round(file.variantProgress[variant.name] || 0)}%
                                        </span>
                                      </div>
                                    ) : (
                                      <video
                                        src={variant.url}
                                        controls
                                        style={{
                                          width: '100%',
                                          height: 'auto',
                                          aspectRatio: '16/9',
                                          objectFit: 'contain',
                                          borderRadius: '4px',
                                          marginBottom: '8px'
                                        }}
                                      />
                                    )}
                                    
                                    <div style={{ fontSize: '11px', color: 'rgb(241, 245, 249)' }}>
                                      <div><strong>Codec: {variant.codec}</strong></div>
                                      <div>Target: {variant.bitrate?.toLocaleString() || 'N/A'} kbps</div>
                                      <div>URL: <a href={variant.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '10px', wordBreak: 'break-all', color: '#59BB91' }}>{variant.url}</a></div>
                                      {variant.size && (
                                        <div>Size: {formatFileSize(variant.size)}</div>
                                      )}
                                      {variant.metadata && variant.metadata.bitrate && (
                                        <div style={{
                                          marginTop: '4px',
                                          padding: '2px 4px',
                                          backgroundColor: '#1E1E23',
                                          borderRadius: '2px',
                                          fontSize: '10px'
                                        }}>
                                          Accuracy: {Math.abs(((variant.metadata.bitrate - variant.bitrate!) / variant.bitrate! * 100)).toFixed(1)}% {Math.abs(variant.metadata.bitrate - variant.bitrate!) < variant.bitrate! * 0.1 ? 'Good' : 'Fair'}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })()}
                      </div>

                      {/* Enhanced Compression Analysis */}
                      <div style={{
                        padding: '12px',
                        backgroundColor: '#1E1E23',
                        border: '1px solid #207593',
                        borderRadius: '6px',
                        fontSize: '12px'
                      }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', color: 'white' }}>
                          Comprehensive Video Analysis
                        </div>
                        
                        {/* Original File Analysis */}
                        {file.videoVariants && file.videoVariants.length > 0 && file.videoVariants[0].metadata && (
                          <div style={{ marginBottom: '10px', padding: '8px', backgroundColor: '#1E1E23', borderRadius: '4px', border: '1px solid #207593' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '11px', marginBottom: '4px', color: 'white' }}>Original File Analysis:</div>
                            <div style={{ fontSize: '10px', color: 'rgb(241, 245, 249)' }}>
                              <div>Source: {file.videoVariants[0].metadata.fileFormat || 'Unknown format'}</div>
                              <div>Codec: {file.videoVariants[0].metadata.codec || 'Unknown codec'}</div>
                              <div>Bitrate: {file.videoVariants[0].metadata.bitrate?.toLocaleString() || 'Calculating...'} kbps</div>
                              <div>Resolution: {file.videoVariants[0].metadata.resolution || 'Unknown'}</div>
                              <div>Size: {file.videoVariants[0].size ? formatFileSize(file.videoVariants[0].size) : 'Unknown'}</div>
                              <div>URL: <a href={file.videoVariants[0].url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', wordBreak: 'break-all', color: '#59BB91' }}>{file.videoVariants[0].url}</a></div>
                            </div>
                          </div>
                        )}
                        
                        {/* Compression Efficiency Summary */}
                        {file.videoVariants && file.videoVariants.length > 1 && (
                          <div style={{ color: 'rgb(241, 245, 249)' }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '4px', color: 'white' }}>Compression Results:</div>
                            <div style={{ fontSize: '12px', lineHeight: '1.4', color: 'white' }}>
                              • <strong>Variants Generated</strong>: {file.videoVariants.length - 1} optimized versions<br/>
                              • <strong>Codecs Tested</strong>: {[...new Set(file.videoVariants.slice(1).map(v => v.codec))].join(', ')}<br/>
                              • <strong>Bitrate Range</strong>: {Math.min(...file.videoVariants.slice(1).filter(v => v.bitrate).map(v => v.bitrate!)).toLocaleString()}kbps - {Math.max(...file.videoVariants.slice(1).filter(v => v.bitrate).map(v => v.bitrate!)).toLocaleString()}kbps<br/>
                              {file.videoVariants.filter(v => v.size).length > 1 && (
                                <>
                                  • <strong>Size Range</strong>: {formatFileSize(Math.min(...file.videoVariants.filter(v => v.size).map(v => v.size!)))} - {formatFileSize(Math.max(...file.videoVariants.filter(v => v.size).map(v => v.size!)))}<br/>
                                  • <strong>Best Compression</strong>: {(() => {
                                    const originalSize = file.videoVariants[0]?.size
                                    const smallestVariant = file.videoVariants.slice(1).filter(v => v.size).reduce((smallest, current) => 
                                      current.size! < smallest.size! ? current : smallest
                                    )
                                    const savings = originalSize && smallestVariant.size ? ((originalSize - smallestVariant.size) / originalSize * 100).toFixed(1) : 'N/A'
                                    return `${smallestVariant.name} (${savings}% reduction)`
                                  })()}
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                      
                  {file.status === 'error' && (
                    <div className="error-status">
                      <p>Upload failed: {file.error}</p>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default App