import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../index.js';

const router = express.Router();

// 確保上傳目錄存在
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ========== 安全验证函数 ==========

// 验证文件名 - 防止路径遍历攻击
const isValidFilename = (filename) => {
  // 禁止路径遍历字符
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }
  // 只允许安全的字符
  const safePattern = /^[a-zA-Z0-9_\-\.]+$/;
  return safePattern.test(filename);
};

// 验证文件扩展名
const isAllowedExtension = (filename) => {
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.svg'];
  const ext = path.extname(filename).toLowerCase();
  return allowedExtensions.includes(ext);
};

// 验证 MIME 类型
const isAllowedMimeType = (mimetype) => {
  const allowedTypes = [
    'image/jpeg', 
    'image/png', 
    'image/gif', 
    'image/webp', 
    'image/svg+xml',
    'video/mp4', 
    'video/webm'
  ];
  return allowedTypes.includes(mimetype);
};

// Multer 配置 - 加强安全性
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 使用 UUID 生成安全的文件名，保留原始扩展名
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = isAllowedExtension(file.originalname) ? ext : '.bin';
    const filename = `${uuidv4()}${safeExt}`;
    cb(null, filename);
  }
});

// 文件过滤器增强
const fileFilter = (req, file, cb) => {
  // 检查 MIME 类型
  if (!isAllowedMimeType(file.mimetype)) {
    return cb(new Error('不支持的文件类型'), false);
  }
  
  // 再次检查扩展名
  if (!isAllowedExtension(file.originalname)) {
    return cb(new Error('不支持的文件扩展名'), false);
  }
  
  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10 // 最多10个文件
  },
  fileFilter
});

// ========== 认证中间件（可选，用于保护管理端点）============
// 在生产环境中应该添加真正的认证机制
const requireAuth = (req, res, next) => {
  // TODO: 在生产环境中实现真正的认证
  // 例如：检查 JWT token、session 等
  const authHeader = req.headers.authorization;
  
  // 开发环境暂时跳过认证，生产环境必须启用
  if (process.env.NODE_ENV === 'production' && !authHeader) {
    return res.status(401).json({ error: '需要认证' });
  }
  
  next();
};

// 上传文件
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '請選擇要上傳的文件' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    
    // 如果配置了 Supabase，也可以上传到 Supabase Storage
    if (
      process.env.SUPABASE_URL && 
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      supabase
    ) {
      const fileBuffer = fs.readFileSync(req.file.path);
      const fileExt = path.extname(req.file.originalname);
      const fileName = `${uuidv4()}${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from('uploads')
        .upload(fileName, fileBuffer, {
          contentType: req.file.mimetype
        });
      
      if (!error && data) {
        const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(fileName);
        
        // 上传成功后删除本地临时文件
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {
          console.error('删除临时文件失败:', e);
        }
        
        return res.json({
          url: urlData.publicUrl,
          filename: fileName,
          originalName: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype
        });
      }
    }
    
    // 本地存储
    res.json({
      url: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  } catch (err) {
    console.error('Error uploading file:', err);
    res.status(500).json({ error: '文件上传失败' });
  }
});

// 多文件上传
router.post('/multiple', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '請選擇要上傳的文件' });
    }
    
    const files = req.files.map(file => ({
      url: `/uploads/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype
    }));
    
    res.json(files);
  } catch (err) {
    console.error('Error uploading files:', err);
    res.status(500).json({ error: '文件上传失败' });
  }
});

// 删除文件 - 修复路径遍历漏洞
router.delete('/:filename(*)', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // 验证文件名安全性 - 防止路径遍历攻击
    if (!isValidFilename(filename)) {
      return res.status(400).json({ error: '无效的文件名' });
    }
    
    const filePath = path.join(uploadDir, filename);
    
    // 验证文件路径在允许的目录内
    const resolvedPath = path.resolve(filePath);
    const uploadDirResolved = path.resolve(uploadDir);
    
    if (!resolvedPath.startsWith(uploadDirResolved)) {
      console.error('路径遍历攻击尝试:', filename);
      return res.status(403).json({ error: '无权删除此文件' });
    }
    
    if (fs.existsSync(filePath)) {
      // 验证文件确实是上传目录中的文件
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        return res.status(400).json({ error: '不是有效的文件' });
      }
      
      fs.unlinkSync(filePath);
      res.json({ message: '文件刪除成功' });
    } else {
      res.status(404).json({ error: '文件不存在' });
    }
  } catch (err) {
    console.error('Error deleting file:', err);
    res.status(500).json({ error: '文件删除失败' });
  }
});

export default router;
