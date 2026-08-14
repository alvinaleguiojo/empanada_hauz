import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

export type ReferralChatIdentity = {
  type: "user" | "partner" | "admin";
  id: string;
  name: string;
};

@Injectable()
export class ReferralChatService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateConversation(identity: ReferralChatIdentity) {
    if (identity.type === "admin") {
      throw new ForbiddenException("Admins must select a referral conversation");
    }
    const where = identity.type === "partner" ? { referralPartnerId: identity.id } : { referralUserId: identity.id };
    let conversation = await this.prisma.referralChatConversation.findFirst({ where, orderBy: { updatedAt: "desc" } });
    if (!conversation) {
      conversation = await this.prisma.referralChatConversation.create({
        data: identity.type === "partner" ? { referralPartnerId: identity.id } : { referralUserId: identity.id }
      });
    }
    return conversation;
  }

  async listAdminConversations() {
    const conversations = await this.prisma.referralChatConversation.findMany({ orderBy: { updatedAt: "desc" } });
    const userIds = conversations.map((item) => item.referralUserId).filter((id): id is string => Boolean(id));
    const partnerIds = conversations.map((item) => item.referralPartnerId).filter((id): id is string => Boolean(id));
    const [users, partners] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }),
      this.prisma.referralPartner.findMany({ where: { id: { in: partnerIds } }, select: { id: true, name: true, email: true, referralCode: true } })
    ]);
    const usersById = new Map(users.map((user) => [user.id, user]));
    const partnersById = new Map(partners.map((partner) => [partner.id, partner]));
    return Promise.all(conversations.map(async (conversation) => {
      const participant = conversation.referralPartnerId ? partnersById.get(conversation.referralPartnerId) : conversation.referralUserId ? usersById.get(conversation.referralUserId) : undefined;
      const unreadCount = await this.prisma.referralChatMessage.count({ where: { conversationId: conversation.id, senderType: { not: "admin" }, readAt: null } });
      return {
        ...conversation,
        participant: participant ? { id: participant.id, name: participant.name, email: participant.email, referralCode: "referralCode" in participant ? participant.referralCode : null } : null,
        unreadCount
      };
    }));
  }

  async getMessages(conversationId: string, identity: ReferralChatIdentity) {
    await this.assertAccess(conversationId, identity);
    return this.prisma.referralChatMessage.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" }, take: 500 });
  }

  async sendMessage(conversationId: string, identity: ReferralChatIdentity, content: string) {
    const text = content.trim();
    if (!text) throw new ForbiddenException("Message cannot be empty");
    const conversation = await this.assertAccess(conversationId, identity);
    const message = await this.prisma.referralChatMessage.create({
      data: { conversationId, senderType: identity.type, senderId: identity.id, senderName: identity.name, content: text.slice(0, 2000) }
    });
    await this.prisma.referralChatConversation.update({
      where: { id: conversation.id },
      data: { lastMessage: message.content, lastMessageAt: message.createdAt, updatedAt: message.createdAt, ...(identity.type === "admin" ? { adminUserId: identity.id } : {}) }
    });
    return message;
  }

  async markRead(conversationId: string, identity: ReferralChatIdentity) {
    await this.assertAccess(conversationId, identity);
    await this.prisma.referralChatMessage.updateMany({
      where: { conversationId, senderType: identity.type === "admin" ? { not: "admin" } : "admin", readAt: null },
      data: { readAt: new Date() }
    });
    return { ok: true };
  }

  async getUnreadCount(identity: ReferralChatIdentity) {
    const conversation = await this.getOrCreateConversation(identity);
    return this.prisma.referralChatMessage.count({ where: { conversationId: conversation.id, senderType: identity.type === "admin" ? { not: "admin" } : "admin", readAt: null } });
  }

  private async assertAccess(conversationId: string, identity: ReferralChatIdentity) {
    const conversation = await this.prisma.referralChatConversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundException("Referral chat conversation not found");
    const allowed = identity.type === "admin" ? true : identity.type === "partner" ? conversation.referralPartnerId === identity.id : conversation.referralUserId === identity.id;
    if (!allowed) throw new ForbiddenException("You do not have access to this conversation");
    return conversation;
  }
}
