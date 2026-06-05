import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export const appCorsOptions: CorsOptions = {
  origin: '*',
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-API-Key'],
  optionsSuccessStatus: 204,
};
