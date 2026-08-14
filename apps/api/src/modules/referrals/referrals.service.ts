
type ReferralPartner = {
  id: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  passwordHash: string;
  referralCode: string;
  approvalStatus?: string | null;
  approvedAt?: Date | null;
  approvedById?: string | null;
  createdAt?: Date;
};

type ReferralPrisma = {
  referral: {
    findMany: (args: unknown) => Promise<ReferralRecord[]>;
    findUnique: (args: unknown) => Promise<ReferralRecord | null>;
    update: (args: unknown) => Promise<ReferralRecord>;
    upsert: (args: unknown) => Promise<ReferralRecord>;
  };
  user: {
    findFirst: (args: unknown) => Promise<ReferralUser | null>;
    findUnique: (args: unknown) => Promise<ReferralUser | null>;
    findMany: (args: unknown) => Promise<ReferralUser[]>;
    update: (args: unknown) => Promise<ReferralUser>;
  };
  referralPartner: {
    findMany: (args: unknown) => Promise<ReferralPartner[]>;
    findFirst: (args: unknown) => Promise<ReferralPartner | null>;
    findUnique: (args: unknown) => Promise<ReferralPartner | null>;
    create: (args: unknown) => Promise<ReferralPartner>;
    update: (args: unknown) => Promise<ReferralPartner>;
    count: (args: unknown) => Promise<number>;
  };
};

@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,