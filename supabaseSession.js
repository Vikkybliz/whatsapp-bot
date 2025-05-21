const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 🔑 Load environment variables
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const BUCKET = 'whatsapp-auth';
const LOCAL_AUTH_DIR = './auth';

/**
 * Upload a single file to Supabase
 */
async function uploadAuthFile(fullPath) {
  const content = fs.readFileSync(fullPath);
  const relativePath = path.relative(LOCAL_AUTH_DIR, fullPath).replace(/\\/g, '/');
  const remotePath = `auth/${relativePath}`;

  const { error } = await supabase.storage.from(BUCKET).upload(remotePath, content, {
    upsert: true,
  });

  if (error) {
    console.error(`❌ Upload failed: ${remotePath}`, error.message);
  } else {
    console.log(`✅ Uploaded ${remotePath}`);
  }
}

/**
 * Recursively upload all files in ./auth
 */
async function uploadAllAuthFiles(dir = LOCAL_AUTH_DIR) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await uploadAllAuthFiles(fullPath);
    } else {
      await uploadAuthFile(fullPath);
    }
  }
}

/**
 * Download all files from Supabase storage and write to ./auth
 */
async function downloadAllAuthFiles() {
  const { data, error } = await supabase.storage.from(BUCKET).list('auth', {
    limit: 1000,
    offset: 0,
    sortBy: { column: 'name', order: 'asc' },
    recursive: true,
  });

  if (error) {
    console.error('❌ Error listing files:', error.message);
    return;
  }

  for (const file of data) {
    const remotePath = `auth/${file.name}`;
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(BUCKET)
      .download(remotePath);

    if (downloadError || !fileData) {
      console.error(`❌ Failed to download ${file.name}:`, downloadError || 'No data');
      continue;
    }

    const localPath = path.join(LOCAL_AUTH_DIR, file.name);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    const buffer = Buffer.from(await fileData.arrayBuffer());
    fs.writeFileSync(localPath, buffer);
    console.log(`📥 Downloaded ${file.name} → ${localPath}`);
  }
}


module.exports = {
  uploadAllAuthFiles,
  downloadAllAuthFiles,
};
