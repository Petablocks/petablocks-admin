const { Router } = require('express');
const multer = require('multer');
const {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || 'http://minio:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || '',
    secretAccessKey: process.env.MINIO_SECRET_KEY || '',
  },
  forcePathStyle: true,
});

// GET /api/files?bucket=server-icons
router.get('/', async (req, res) => {
  const bucket = String(req.query.bucket || 'server-icons');
  try {
    const cmd = new ListObjectsV2Command({ Bucket: bucket });
    const data = await s3.send(cmd);
    const files = (data.Contents || []).map((obj) => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified,
      bucket,
    }));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/files/upload
router.post('/upload', upload.single('file'), async (req, res) => {
  const bucket = String(req.body.bucket || 'admin-uploads');
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file provided' });

  try {
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: file.originalname,
      Body: file.buffer,
      ContentType: file.mimetype,
    });
    await s3.send(cmd);
    res.json({ ok: true, key: file.originalname, bucket });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/files/:key?bucket=server-icons
router.delete('/:key', async (req, res) => {
  const bucket = String(req.query.bucket || 'admin-uploads');
  try {
    const cmd = new DeleteObjectCommand({ Bucket: bucket, Key: req.params.key });
    await s3.send(cmd);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

module.exports = router;
