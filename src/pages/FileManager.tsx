import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, Trash2, Copy, FolderOpen, Image } from 'lucide-react'
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">File Manager</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage MinIO S3 assets directly inside Admin UI</p>
        </div>
        <div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Upload className="h-4 w-4" />
            Upload File
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
      <div className="flex gap-2 border-b border-border pb-0">
        {BUCKETS.map((bucket) => (
          <button
            key={bucket}
            onClick={() => setSelectedBucket(bucket)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              selectedBucket === bucket
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <FolderOpen className="h-4 w-4" />
            {bucket}
          </button>
        ))}
      </div>

      {/* File list */}
      {isLoading ? (
        <p className="text-muted-foreground">Loading bucket contents...</p>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-lg border border-border bg-card">
          <FolderOpen className="h-12 w-12 mb-3 opacity-30" />
          <p className="font-medium">No files found in {selectedBucket}</p>
          <p className="text-xs mt-1">Upload images, icons, or server assets</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">File</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Size</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Modified</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.key} className="border-b border-border last:border-0 hover:bg-muted/10">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Image className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-mono text-xs truncate max-w-xs">{f.key}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatSize(f.size)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(f.lastModified).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => copyUrl(f.key)}
                        className="p-1.5 rounded hover:bg-accent"
                        title={copied === f.key ? 'Copied Public URL!' : 'Copy Public URL'}
                      >
                        <Copy className={cn('h-3.5 w-3.5', copied === f.key && 'text-primary')} />
                      </button>
                      <button
                        onClick={() => remove.mutate(f.key)}
                        className="p-1.5 rounded hover:bg-destructive/20 hover:text-destructive"
                        title="Delete File"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
