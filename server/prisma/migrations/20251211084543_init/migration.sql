-- CreateTable
CREATE TABLE "SkewSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "oiSkew" REAL NOT NULL,
    "pricingSkew" REAL,
    "impliedMove" REAL,
    "underlyingPrice" REAL,
    "dte" INTEGER NOT NULL,
    "expirationDate" TEXT NOT NULL,
    "callOi" INTEGER NOT NULL,
    "putOi" INTEGER NOT NULL,
    "callDelta" REAL NOT NULL,
    "putDelta" REAL NOT NULL
);

-- CreateIndex
CREATE INDEX "SkewSnapshot_symbol_timestamp_idx" ON "SkewSnapshot"("symbol", "timestamp");

-- CreateIndex
CREATE INDEX "SkewSnapshot_timestamp_idx" ON "SkewSnapshot"("timestamp");
