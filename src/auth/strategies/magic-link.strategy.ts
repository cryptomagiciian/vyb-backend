import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';

@Injectable()
export class MagicLinkStrategy extends PassportStrategy(Strategy, 'magic-link') {
  constructor() {
    super();
  }

  async validate(req: any): Promise<any> {
    // Magic link validation is handled in the service
    // This strategy is mainly for passport compatibility
    return req.user;
  }
}
