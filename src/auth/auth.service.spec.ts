import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { Clinic } from '../clinic/schemas/clinic.schema';
import { UserService } from '../user/user.service';
import { UserRole } from '../user/schemas/user.schema';

describe('AuthService', () => {
  let service: AuthService;
  const userService = {
    findByEmailWithPassword: jest.fn(),
    findByPhoneWithPassword: jest.fn(),
  };
  const jwtService = { sign: jest.fn().mockReturnValue('signed-token') };
  const clinicModel = { exists: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: userService },
        { provide: JwtService, useValue: jwtService },
        { provide: getModelToken(Clinic.name), useValue: clinicModel },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('login rejects invalid password', async () => {
    const hash = await bcrypt.hash('correct', 12);
    userService.findByEmailWithPassword.mockResolvedValue({
      _id: 'uid',
      name: 'Test',
      role: UserRole.ADMIN,
      clinicId: { toString: () => 'clinic1' },
      passwordHash: hash,
    });

    await expect(
      service.login({ identifier: 'a@test.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login returns token for valid credentials', async () => {
    const hash = await bcrypt.hash('secret123', 12);
    userService.findByEmailWithPassword.mockResolvedValue({
      _id: { toString: () => 'uid1' },
      name: 'Test',
      role: UserRole.ADMIN,
      clinicId: { toString: () => 'clinic1' },
      passwordHash: hash,
    });

    const result = await service.login({
      identifier: 'a@test.com',
      password: 'secret123',
    });

    expect(result.accessToken).toBe('signed-token');
    expect(result.user.role).toBe(UserRole.ADMIN);
  });
});
