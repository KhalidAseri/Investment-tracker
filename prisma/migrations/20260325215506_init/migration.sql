-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "holdings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT NOT NULL,
    "symbol" TEXT,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "shares" REAL NOT NULL DEFAULT 0,
    "average_cost" REAL NOT NULL DEFAULT 0,
    "current_value" REAL,
    "target_allocation" REAL,
    "sector" TEXT,
    "index_tracked" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "holdings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT NOT NULL,
    "holding_id" TEXT,
    "type" TEXT NOT NULL,
    "symbol" TEXT,
    "shares" REAL,
    "price_per_share" REAL,
    "total_amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "date" DATETIME NOT NULL,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "transactions_holding_id_fkey" FOREIGN KEY ("holding_id") REFERENCES "holdings" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "dividends" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "holding_id" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "per_share" REAL NOT NULL,
    "ex_date" DATETIME NOT NULL,
    "pay_date" DATETIME NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dividends_holding_id_fkey" FOREIGN KEY ("holding_id") REFERENCES "holdings" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "market_cache" (
    "symbol" TEXT NOT NULL PRIMARY KEY,
    "price" REAL NOT NULL,
    "change" REAL NOT NULL DEFAULT 0,
    "change_percent" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "name" TEXT,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "portfolio_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "total_value" REAL NOT NULL,
    "breakdown" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "holdings_account_id_symbol_key" ON "holdings"("account_id", "symbol");

-- CreateIndex
CREATE INDEX "transactions_account_id_date_idx" ON "transactions"("account_id", "date");

-- CreateIndex
CREATE INDEX "dividends_holding_id_pay_date_idx" ON "dividends"("holding_id", "pay_date");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_snapshots_date_key" ON "portfolio_snapshots"("date");
