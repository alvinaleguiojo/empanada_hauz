import * as bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("ChangeMe123!", 10);

  await prisma.user.upsert({
    where: { email: "admin@empanadahauz.local" },
    update: {},
    create: {
      email: "admin@empanadahauz.local",
      name: "Operations Admin",
      passwordHash,
      role: "admin"
    }
  });

  const items = [
    ["flour", "Flour", "kg", 50, 10, 42],
    ["pork", "Pork", "kg", 35, 8, 240],
    ["butter", "Butter", "kg", 12, 4, 390],
    ["oil", "Oil", "l", 20, 5, 85],
    ["raisins", "Raisins", "kg", 6, 2, 320],
    ["cheese", "Cheese", "kg", 10, 3, 410],
    ["gas", "Gas", "tank", 3, 1, 980]
  ] as const;

  for (const [itemType, displayName, unit, currentStock, reorderLevel, costPerUnit] of items) {
    await prisma.inventoryItem.upsert({
      where: { itemType },
      update: { displayName, unit, currentStock, reorderLevel, costPerUnit },
      create: {
        itemType,
        displayName,
        unit,
        currentStock,
        reorderLevel,
        costPerUnit
      }
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
