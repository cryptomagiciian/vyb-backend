import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';

@Injectable()
export class WalletStrategy extends PassportStrategy(Strategy, 'wallet') {
  constructor() {
    super();
  }

  async validate(req: any): Promise<any> {
    // Wallet signature validation is handled in the service
    // This strategy is mainly for passport compatibility
    return req.user;
  }
}
