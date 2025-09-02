const { Client } = require('minio');
const dotenv = require('dotenv');
dotenv.config();

let minioClient;

function getMinioClient() {
  if (!minioClient) {
    minioClient = new Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: Number(process.env.MINIO_PORT) || 9000,
      useSSL: (process.env.MINIO_USE_SSL || 'false').toLowerCase() === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
    });
  }
  return minioClient;
}

async function ensureBucket(bucketName) {
  const client = getMinioClient();
  const exists = await client.bucketExists(bucketName).catch(() => false);
  if (!exists) {
    await client.makeBucket(bucketName, 'us-east-1');
  }
}

async function putObjectFromStream(bucket, objectName, stream, size, contentType) {
  const client = getMinioClient();
  await ensureBucket(bucket);
  const meta = {};
  if (contentType) meta['Content-Type'] = contentType;
  await client.putObject(bucket, objectName, stream, size, meta);
  return {
    bucket,
    objectName
  };
}

async function getPresignedUrl(bucket, objectName, expirySeconds = 3600) {
  const client = getMinioClient();
  return client.presignedGetObject(bucket, objectName, expirySeconds);
}

module.exports = {
  getMinioClient,
  ensureBucket,
  putObjectFromStream,
  getPresignedUrl
};


