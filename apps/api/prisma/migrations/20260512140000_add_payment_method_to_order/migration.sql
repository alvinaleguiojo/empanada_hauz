CREATE TYPE "PaymentMethod" AS ENUM ('cod', 'gcash');

ALTER TABLE "Order"
ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'cod';
