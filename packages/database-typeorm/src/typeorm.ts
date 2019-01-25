import { ConnectionInformations, CreateUser, DatabaseInterface } from '@accounts/types';
import { Repository, getRepository } from 'typeorm';
import { User } from './entity/User';
import { UserEmail } from './entity/UserEmail';
import { UserService } from './entity/UserService';
import { UserSession } from './entity/UserSession';
import { AccountsTypeormOptions } from './types';

const defaultOptions = {
  userEntity: User,
  userEmailEntity: UserEmail,
  userServiceEntity: UserService,
  userSessionEntity: UserSession,
};

export class AccountsTypeorm implements DatabaseInterface {
  private options: AccountsTypeormOptions & typeof defaultOptions;
  private userRepository: Repository<User>;
  private emailRepository: Repository<UserEmail>;
  private serviceRepository: Repository<UserService>;
  private sessionRepository: Repository<UserSession>;

  constructor(options?: AccountsTypeormOptions) {
    this.options = { ...defaultOptions, ...options };
    this.userRepository = getRepository(this.options.userEntity, this.options.connectionName);
    this.emailRepository = getRepository(this.options.userEmailEntity, this.options.connectionName);
    this.serviceRepository = getRepository(
      this.options.userServiceEntity,
      this.options.connectionName
    );
    this.sessionRepository = getRepository(
      this.options.userSessionEntity,
      this.options.connectionName
    );
  }

  public async findUserByEmail(email: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (user) {
      return user;
    }

    return null;
  }

  public async findUserByUsername(username: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { username },
    });

    if (user) {
      return user;
    }

    return null;
  }

  public async findUserById(userId: string): Promise<User | null> {
    const user = await this.userRepository.findOne(userId);
    if (!user) {
      // throw new Error('User not found');
      return null;
    }
    return user;
  }

  public async findUserByResetPasswordToken(token: string): Promise<User | null> {
    const service = await this.serviceRepository.findOne({
      where: {
        name: 'password.reset',
        token,
      },
    });

    if (service) {
      return this.findUserById(service.userId);
    }

    return null;
  }

  public async findUserByEmailVerificationToken(token: string): Promise<User | null> {
    const service = await this.serviceRepository.findOne({
      where: {
        name: 'email.verificationTokens',
        token,
      },
    });

    if (service) {
      return this.findUserById(service.userId);
    }

    return null;
  }

  public async createUser(createUser: CreateUser): Promise<string> {
    const { username, email, password } = createUser;

    const user = new User();

    if (email) {
      const userEmail = new UserEmail();
      userEmail.address = email.toLocaleLowerCase();
      userEmail.verified = false;
      await this.emailRepository.save(userEmail);
      user.emails = [userEmail];
    }

    if (password) {
      const userService = new UserService();
      userService.name = 'password';
      userService.options = { bcrypt: password };
      await this.serviceRepository.save(userService);
      user.allServices = [userService];
    }

    if (username) {
      user.username = username;
    }

    await this.userRepository.save(user);

    return user.id;
  }

  public async setUsername(userId: string, newUsername: string): Promise<void> {
    const user = await this.findUserById(userId);
    if (user) {
      user.username = newUsername;
      await this.userRepository.save(user);
      return;
    }
    throw new Error('User not found');
  }

  public async setProfile(userId: string, profile: object): Promise<object> {
    const user = await this.findUserById(userId);
    if (user) {
      user.profile = profile;
      await this.userRepository.save(user);
      return profile;
    }
    throw new Error('User not found');
  }

  public async findUserByServiceId(serviceName: string, serviceId: string): Promise<User | null> {
    const service = await this.serviceRepository.findOne({
      name: serviceName,
      serviceId,
    });

    if (service) {
      return this.findUserById(service.userId);
    }

    return null;
  }

  public async getService(userId: string, serviceName: string): Promise<UserService | null> {
    const user = await this.findUserById(userId);
    if (user) {
      const service = user.allServices.find(s => s.name === serviceName);
      if (service) {
        return service;
      }
    }

    return null;
  }

  public async setService(
    userId: string,
    serviceName: string,
    data: object,
    token?: string
  ): Promise<void> {
    let service = await this.getService(userId, serviceName);

    if (!service) {
      const user = await this.findUserById(userId);
      if (user) {
        service = new UserService();
        service.name = serviceName;
        service.user = user;
      }
    }

    const { id = null, ...options } = data as any;

    if (service) {
      service.options = options;

      if (id) {
        service.serviceId = id;
      }

      if (token) {
        service.token = token;
      }

      await this.serviceRepository.save(service);
    }
  }

  public async unsetService(userId: string, serviceName: string): Promise<void> {
    const user = await this.findUserById(userId);
    if (user) {
      const service = user.allServices.find(s => s.name === serviceName);
      if (service) {
        await this.serviceRepository.remove(service);
      }
    }
  }

  public async findPasswordHash(userId: string): Promise<string | null> {
    const service = await this.getService(userId, 'password');
    if (service) {
      return service.options.bcrypt;
    }
    return null;
  }

  public async setPassword(userId: string, newPassword: string): Promise<void> {
    const user = await this.findUserById(userId);
    if (user) {
      const service = await this.getService(userId, 'password');
      if (service) {
        service.options = { bcrypt: newPassword };
        await this.serviceRepository.save(service);
        await this.userRepository.update({ id: user.id }, {});
        return;
      }
    }
    throw new Error('User not found');
  }

  public async addResetPasswordToken(
    userId: string,
    email: string,
    token: string,
    reason: string
  ): Promise<void> {
    await this.setService(
      userId,
      'password.reset',
      {
        address: email.toLocaleLowerCase(),
        when: new Date().toJSON(),
        reason,
      },
      token
    );
  }

  public async setResetPassword(
    userId: string,
    email: string,
    newPassword: string,
    token?: string
  ): Promise<void> {
    await this.setPassword(userId, newPassword);
    await this.unsetService(userId, 'password.reset');
  }

  public async addEmail(userId: string, newEmail: string, verified: boolean): Promise<void> {
    const user = await this.findUserById(userId);
    if (user) {
      const userEmail = new UserEmail();
      userEmail.user = user;
      userEmail.address = newEmail.toLocaleLowerCase();
      userEmail.verified = verified;
      await this.emailRepository.save(userEmail);
      await this.userRepository.update({ id: user.id }, {});
      return;
    }
    throw new Error('User not found');
  }

  public async removeEmail(userId: string, email: string): Promise<void> {
    const user = await this.findUserById(userId);
    if (user) {
      const userEmail = user.emails.find(s => s.address === email.toLocaleLowerCase());
      if (!userEmail) {
        throw new Error('Email not found');
      }
      await this.emailRepository.remove(userEmail);
      await this.userRepository.update({ id: user.id }, {});
      return;
    }
    throw new Error('User not found');
  }

  public async verifyEmail(userId: string, email: string): Promise<void> {
    const user = await this.findUserById(userId);
    if (user) {
      const userEmail = user.emails.find(s => s.address === email.toLocaleLowerCase());

      if (!userEmail) {
        throw new Error('Email not found');
      }
      userEmail.verified = true;
      await this.emailRepository.save(userEmail);
      await this.unsetService(userId, 'email.verificationTokens');
      await this.userRepository.update({ id: user.id }, {});
      return;
    }
    throw new Error('User not found');
  }

  public async addEmailVerificationToken(
    userId: string,
    email: string,
    token: string
  ): Promise<void> {
    await this.setService(
      userId,
      'email.verificationTokens',
      {
        address: email.toLocaleLowerCase(),
        when: new Date(),
      },
      token
    );
  }

  public async setUserDeactivated(userId: string, deactivated: boolean): Promise<void> {
    const user = await this.findUserById(userId);
    if (user) {
      user.deactivated = deactivated;
      await this.userRepository.save(user);
    }
  }

  public async findSessionById(sessionId: string): Promise<UserSession | null> {
    try {
      const session = await this.sessionRepository.findOne(sessionId);

      if (session) {
        return session;
      }
    } catch (err) {
      // noop
    }

    return null;
  }

  public async findSessionByToken(token: string) {
    const session = await this.sessionRepository.findOne({ token });
    if (!session) {
      return null;
    }
    return session;
  }

  public async createSession(
    userId: string,
    token: string,
    connection: ConnectionInformations = {},
    extra?: object
  ) {
    const user = await this.findUserById(userId);
    if (user) {
      const session = new UserSession();
      session.user = user;
      session.token = token;
      session.userAgent = connection.userAgent;
      session.ip = connection.ip;
      if (extra) {
        session.extra = extra;
      }
      session.valid = true;
      await this.sessionRepository.save(session);

      return session.id;
    }

    return null;
  }

  public async updateSession(sessionId: string, connection: ConnectionInformations): Promise<void> {
    const session = await this.findSessionById(sessionId);
    if (session) {
      session.userAgent = connection.userAgent;
      session.ip = connection.ip;
      await this.sessionRepository.save(session);
    }
  }

  public async invalidateSession(sessionId: string): Promise<void> {
    const session = await this.findSessionById(sessionId);
    if (session) {
      session.valid = false;
      await this.sessionRepository.save(session);
    }
  }

  public async invalidateAllSessions(userId: string): Promise<void> {
    const user = await this.findUserById(userId);
    if (user) {
      await Promise.all(user.sessions.map(session => this.sessionRepository.remove(session)));
    }
  }
}