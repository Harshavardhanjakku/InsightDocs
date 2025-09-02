const express = require('express');
const pool = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { putObjectFromStream, getPresignedUrl } = require('../config/minio');
const dotenv = require('dotenv');
dotenv.config();

const router = express.Router();

// Use in-memory storage and stream to MinIO
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'insightdocs';

// Upload media file
router.post("/upload", upload.single("file"), async (req, res) => {
  const { title, type, uploaded_by } = req.body;

  if (!req.file || !title || !type || !uploaded_by) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Find uploader's organization
    const orgRes = await pool.query(
      'SELECT organization_id FROM organization_users WHERE user_id = $1 LIMIT 1',
      [uploaded_by]
    );
    if (orgRes.rows.length === 0) {
      return res.status(400).json({ error: 'Uploader is not linked to any organization' });
    }
    const organization_id = orgRes.rows[0].organization_id;

    // Build object key under org namespace
    const extension = (req.file.originalname.split('.').pop() || '').toLowerCase();
    const objectName = `${organization_id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

    // Upload to MinIO
    await putObjectFromStream(
      MINIO_BUCKET,
      objectName,
      req.file.stream || Buffer.from(req.file.buffer),
      req.file.size,
      req.file.mimetype
    );

    // Persist media record. Store MinIO key in file_path for now
    const result = await pool.query(
      `INSERT INTO media (title, type, file_path, uploaded_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [title, type, objectName, uploaded_by]
    );

    // Return with presigned URL
    const url = await getPresignedUrl(MINIO_BUCKET, objectName, 3600);

    res.status(201).json({
      message: "File uploaded successfully",
      media: { ...result.rows[0], organization_id, url }
    });
  } catch (err) {
    console.error("Error uploading/saving media:", err);
    res.status(500).json({ 
      error: "Error saving media record", 
      detail: err.message 
    });
  }
});

// Get media for specific user only ✅
router.get('/', async (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).json({ 
      error: 'Missing userId parameter. Please provide ?userId=your-user-id' 
    });
  }

  try {
    // Only get media uploaded by this specific user
    // Replace the media query in GET /media with:
const result = await pool.query(
  `SELECT m.*, u.username AS uploaded_by_username
   FROM media m
   JOIN users u ON m.uploaded_by = u.id
   WHERE m.uploaded_by = $1
   ORDER BY m.created_at DESC`,
  [userId]
);
res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching media' });
  }
});

router.get('/upload', (req, res) => {
  res.send("Upload endpoint — use POST with form-data");
});

// List media for entire organization (all members can view)
router.get('/org/:orgId', async (req, res) => {
  const { orgId } = req.params;
  try {
    // Get all media uploaded by users who belong to this org
    const result = await pool.query(
      `SELECT m.*, u.username AS uploaded_by_username
       FROM media m
       JOIN users u ON m.uploaded_by = u.id
       JOIN organization_users ou ON ou.user_id = u.id
       WHERE ou.organization_id = $1
       ORDER BY m.created_at DESC`,
      [orgId]
    );

    // Attach presigned URLs for each item
    const items = await Promise.all(result.rows.map(async (row) => {
      const url = await getPresignedUrl(MINIO_BUCKET, row.file_path, 3600).catch(() => null);
      return { ...row, url };
    }));

    res.json(items);
  } catch (err) {
    console.error('Error fetching org media:', err);
    res.status(500).json({ error: 'Error fetching org media' });
  }
});

// Add this to your server/routes/media.js file

// Delete media file
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Get the file path before deleting the record
    const result = await pool.query('SELECT file_path FROM media WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }
    
    const filePath = result.rows[0].file_path;
    
    // Delete the database record
    await pool.query('DELETE FROM media WHERE id = $1', [id]);
    
    // Optionally delete the physical file
    const fullPath = path.join(__dirname, '..', filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    
    res.json({ message: 'Media file deleted successfully' });
  } catch (err) {
    console.error('Error deleting media:', err);
    res.status(500).json({ error: 'Error deleting media file' });
  }
});

// Edit/Update media title
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { title } = req.body;

  console.log('PATCH /media/:id called with:', { id, title });

  if (!title || !title.trim()) {
    console.log('Validation failed: Title is required');
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    const result = await pool.query(
      'UPDATE media SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [title.trim(), id]
    );

    if (result.rows.length === 0) {
      console.log('No media found with id:', id);
      return res.status(404).json({ error: 'Media file not found' });
    }

    console.log('Media updated successfully:', result.rows[0]);
    res.json({
      message: 'Media updated successfully',
      media: result.rows
    });
  } catch (err) {
    console.error('Error updating media:', err.message);
    console.error('Full error:', err);
    res.status(500).json({ error: 'Error updating media file', detail: err.message });
  }
});

// Preview media file content
router.get('/:id/preview', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Get media record
    const result = await pool.query('SELECT * FROM media WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }
    
    const media = result.rows[0];
    
    // Check if file exists in MinIO storage
    const possiblePaths = [
      path.join(__dirname, '..', 'minio-local', 'data', 'insightdocs', media.file_path),
      path.join(__dirname, '..', 'minio-win', 'data', 'insightdocs', media.file_path),
      path.join(__dirname, '..', 'minio-data', 'insightdocs', media.file_path)
    ];
    
    let filePath = null;
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        filePath = possiblePath;
        break;
      }
    }
    
    if (!filePath) {
      return res.status(404).json({ error: 'File not found in storage' });
    }
    
    let content = '';
    let previewType = 'text';
    
    // Handle different file types
    if (media.type === 'text/plain' || media.type === 'text/markdown') {
      content = fs.readFileSync(filePath, 'utf8');
      previewType = 'text';
    } else if (media.type.includes('word') || media.type.includes('document') || media.type.includes('docx')) {
      // For Word documents, try to extract text content
      try {
        // Try to read as text first (in case it's a text-based format)
        const rawContent = fs.readFileSync(filePath, 'utf8');
        if (rawContent && rawContent.trim().length > 0 && !rawContent.includes('\x00')) {
          content = rawContent;
          previewType = 'text';
        } else {
          // If it's a binary Word document, provide a placeholder
          content = 'Word document detected. Content preview not available for binary Word files.';
          previewType = 'placeholder';
        }
      } catch (readError) {
        content = 'Word document detected. Content preview not available for binary Word files.';
        previewType = 'placeholder';
      }
    } else if (media.type.includes('pdf')) {
      content = 'PDF document detected. Content preview not available for PDF files.';
      previewType = 'placeholder';
    } else {
      content = 'File type not supported for preview.';
      previewType = 'placeholder';
    }
    
    res.json({
      id: media.id,
      title: media.title,
      type: media.type,
      content: content,
      previewType: previewType,
      size: media.size,
      uploaded_by: media.uploaded_by,
      created_at: media.created_at
    });
    
  } catch (err) {
    console.error('Error previewing media:', err);
    res.status(500).json({ error: 'Error previewing media file', detail: err.message });
  }
});

module.exports = router;