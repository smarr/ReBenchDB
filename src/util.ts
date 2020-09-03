export const robustPath = __dirname.includes('dist/')
  ? function(path) { return `${__dirname}/../../src/${path}`; }
  : function(path) { return `${__dirname}/${path}`; };

export const dbConfig = {
  user: process.env.RDB_USER || '',
  password: process.env.RDB_PASS || '',
  host: process.env.RDB_HOST || 'localhost',
  database: process.env.RDB_DB || 'test_rdb4',
  port: 5432
};

export const siteConfig = {
  reportsUrl: process.env.REPORTS_URL || '/static/reports',
  staticUrl: process.env.STATIC_URL || '/static',
  publicUrl: process.env.PUBLIC_URL || 'https://rebench.stefan-marr.de',
  appId: parseInt(process.env.GITHUB_APP_ID || '') || 76497,
  githubPrivateKey:
    process.env.GITHUB_PK || 'rebenchdb.2020-08-11.private-key.pem',
}
