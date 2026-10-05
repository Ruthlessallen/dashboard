import path from 'node:path';

export const scraperDir = () => process.env.JOBS_SCRAPER_DIR || path.join(process.cwd(), 'scraper');
