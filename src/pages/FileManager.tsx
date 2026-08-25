import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, Trash2, Copy, FolderOpen, Image as ImageIcon, ExternalLink, Check, Eye, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface FileObject {
  key: string
  size: number
  lastModified: string
  bucket: string
}

const BUCKETS = ['server-icons', 'screenshots', 'resource-packs', 'admin-uploads']

export default function FileManagerPage() {
  const [selectedBucket, setSelectedBucket] = useState(BUCKETS[0])
  const [copied, setCopied] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const { data: files = [], isLoading } = useQuery<FileObject[]>({
    queryKey: ['files', selectedBucket],
    queryFn: () => fetch(`/api/files?bucket=${selectedBucket}`).then(r => r.json()),
  })

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      form.append('bucket', selectedBucket)
      return fetch('/api/files/upload', { method: 'POST', body: form }).then(r => r.json())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files', selectedBucket] }),
  })

  const remove = useMutation({
    mutationFn: (key: string) =>
      fetch(`/api/files/${encodeURIComponent(key)}?bucket=${selectedBucket}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files', selectedBucket] }),
  })

  const copyUrl = (key: string) => {
    const url = `https://files.petablocks.com/${selectedBucket}/${key}`
    navigator.clipboard.writeText(url)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const isImage = (key: string) => {
    return /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(key)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      upload.mutate(e.dataTransfer.files[0])
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">MinIO S3 File Manager</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage headless S3 assets and direct public URLs</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={upload.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {upload.isPending ? 'Uploading...' : 'Upload File'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
          />
        </div>
      </div>

      {/* Bucket tabs */}
      <div className="flex gap-2 border-b border-border pb-0 overflow-x-auto">
        {BUCKETS.map((bucket) => (
          <button
            key={bucket}
            onClick={() => setSelectedBucket(bucket)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              selectedBucket === bucket
                ? 'border-emerald-500 text-emerald-400 font-bold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <FolderOpen className="h-4 w-4" />
            {bucket}
          </button>
        ))}
      </div>

      {/* Drag and Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 bg-card/50',
          isDragging ? 'border-emerald-500 bg-emerald-500/10 scale-[1.01]' : 'border-border hover:border-emerald-500/50'
        )}
      >
        <Upload className="h-8 w-8 text-muted-foreground opacity-60" />
        <p className="text-sm font-medium text-foreground">
          Drag and drop files here to upload into <span className="font-mono text-emerald-400 font-bold">{selectedBucket}</span>
        </p>
        <p className="text-xs text-muted-foreground">or click to browse your local device</p>
      </div>

      {/* File list */}
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading bucket contents...</p>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-2xl border border-border bg-card">
          <FolderOpen className="h-12 w-12 mb-3 opacity-30" />
          <p className="font-medium">No files found in {selectedBucket}</p>
          <p className="text-xs mt-1">Uploaded files will be publicly accessible at <code className="text-emerald-400">https://files.petablocks.com/{selectedBucket}/...</code></p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Preview / File</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Size</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Modified</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {files.map((f) => {
                const publicUrl = `https://files.petablocks.com/${selectedBucket}/${f.key}`
                const fileIsImg = isImage(f.key)

                return (
                  <tr key={f.key} className="hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {fileIsImg ? (
                          <img
                            src={publicUrl}
                            alt={f.key}
                            className="h-9 w-9 rounded-lg object-cover bg-black/40 border border-border cursor-pointer shrink-0"
                            onClick={() => setPreviewUrl(publicUrl)}
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <span className="font-mono text-xs font-medium truncate max-w-sm">{f.key}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{formatSize(f.size)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(f.lastModified).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {fileIsImg && (
                          <button
                            onClick={() => setPreviewUrl(publicUrl)}
                            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
                            title="Preview Image"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        <a
                          href={publicUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
                          title="Open Public URL"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        <button
                          onClick={() => copyUrl(f.key)}
                          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
                          title={copied === f.key ? 'Copied URL!' : 'Copy Public URL'}
                        >
                          {copied === f.key ? (
                            <Check className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => confirm(`Delete ${f.key}?`) && remove.mutate(f.key)}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400"
                          title="Delete File"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Image Preview Lightbox */}
      {previewUrl && (
        <div
          onClick={() => setPreviewUrl(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-card p-2 rounded-2xl border border-border" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute -top-3 -right-3 p-1.5 bg-card border border-border rounded-full text-white hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
            <img src={previewUrl} alt="Preview" className="max-h-[80vh] rounded-xl object-contain" />
            <div className="p-3 text-center">
              <a href={previewUrl} target="_blank" rel="noreferrer" className="text-xs text-emerald-400 font-mono hover:underline truncate block">
                {previewUrl}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
