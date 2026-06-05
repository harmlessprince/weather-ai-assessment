import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Request } from 'express';
import appConfig from '../config/app.config';

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const configuredKey = this.config.adminApiKey;

    if (!configuredKey) {
      throw new ServiceUnavailableException('Admin API key is not configured');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const providedKey =
      request.header('x-admin-api-key') ??
      this.extractBearerToken(request.header('authorization'));

    if (providedKey !== configuredKey) {
      throw new UnauthorizedException('Invalid admin API key');
    }

    return true;
  }

  private extractBearerToken(value?: string): string | undefined {
    if (!value?.startsWith('Bearer ')) {
      return undefined;
    }

    return value.slice('Bearer '.length).trim();
  }
}
