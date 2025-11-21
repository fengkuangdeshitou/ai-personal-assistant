import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const Client = require('@alicloud/dypnsapi20170525').default;
const $OpenApi = require('@alicloud/openapi-client');

console.log('Testing client creation...');

const config = new $OpenApi.Config({});
config.accessKeyId = 'YOUR_ACCESS_KEY_ID';
config.accessKeySecret = 'YOUR_ACCESS_KEY_SECRET';

const client = new Client(config);
console.log('Client created successfully!');