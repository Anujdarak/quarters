-- CreateTable
CREATE TABLE "data_sources" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "homepage" TEXT,
    "licenceNotes" TEXT,
    "publicDisplay" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "exchanges" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "website" TEXT
);

-- CreateTable
CREATE TABLE "industries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sector" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "scheme" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "isin" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "industryId" TEXT,
    "fyEndMonth" INTEGER NOT NULL DEFAULT 3,
    "marketCapCr" DECIMAL,
    "marketCapAsOf" DATETIME,
    "marketCapSourceId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "companies_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "industries" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "securities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "symbol" TEXT,
    "scripCode" TEXT,
    "series" TEXT,
    "listingDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "faceValue" DECIMAL,
    "sourceKey" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "fetchedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "securities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "securities_exchange_fkey" FOREIGN KEY ("exchange") REFERENCES "exchanges" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "securityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "effectiveOn" DATETIME,
    "oldValue" TEXT,
    "newValue" TEXT,
    "sourceKey" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "security_events_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "securities" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "trading_calendar" (
    "exchange" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "isTrading" BOOLEAN NOT NULL,
    "note" TEXT,
    "sourceKey" TEXT NOT NULL,

    PRIMARY KEY ("exchange", "date"),
    CONSTRAINT "trading_calendar_exchange_fkey" FOREIGN KEY ("exchange") REFERENCES "exchanges" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "financial_periods" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "fiscalPart" INTEGER,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    CONSTRAINT "financial_periods_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "quarterly_results" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodId" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "audited" BOOLEAN,
    "exchange" TEXT,
    "filedAt" DATETIME,
    "announcementId" TEXT,
    "sourceUnit" TEXT,
    "documentUrl" TEXT,
    "xbrlUrl" TEXT,
    "sourceKey" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quarterly_results_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "financial_periods" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "quarterly_results_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "earnings_announcements" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "financial_metrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resultId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" DECIMAL NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'INR_CR',
    "derived" BOOLEAN NOT NULL DEFAULT false,
    "sourceTag" TEXT,
    CONSTRAINT "financial_metrics_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "quarterly_results" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "earnings_announcements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "periodType" TEXT NOT NULL,
    "fiscalPart" INTEGER,
    "periodEnd" DATETIME NOT NULL,
    "boardMeetingDate" DATETIME,
    "announcedAt" DATETIME NOT NULL,
    "submittedAt" DATETIME,
    "timing" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "basis" TEXT,
    "version" TEXT NOT NULL DEFAULT 'ORIGINAL',
    "subject" TEXT,
    "documentUrl" TEXT,
    "sourceKey" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "fetchedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "earnings_announcements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "board_meetings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "meetingDate" DATETIME NOT NULL,
    "purpose" TEXT NOT NULL,
    "intimatedAt" DATETIME,
    "sourceKey" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "fetchedAt" DATETIME NOT NULL,
    CONSTRAINT "board_meetings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "upcoming_results" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "periodType" TEXT NOT NULL,
    "fiscalPart" INTEGER,
    "status" TEXT NOT NULL,
    "expectedDate" DATETIME,
    "boardMeetingId" TEXT,
    "method" TEXT,
    "sourceUrl" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "upcoming_results_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "historical_prices" (
    "securityId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "open" DECIMAL NOT NULL,
    "high" DECIMAL NOT NULL,
    "low" DECIMAL NOT NULL,
    "close" DECIMAL NOT NULL,
    "volume" BIGINT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL,

    PRIMARY KEY ("securityId", "date"),
    CONSTRAINT "historical_prices_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "securities" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "corporate_actions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "exDate" DATETIME,
    "recordDate" DATETIME,
    "announcedOn" DATETIME,
    "ratioNum" DECIMAL,
    "ratioDen" DECIMAL,
    "amount" DECIMAL,
    "description" TEXT,
    "sourceKey" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "fetchedAt" DATETIME NOT NULL,
    CONSTRAINT "corporate_actions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "corporate_announcements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "announcedAt" DATETIME NOT NULL,
    "documentUrl" TEXT,
    "sourceKey" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "fetchedAt" DATETIME NOT NULL,
    CONSTRAINT "corporate_announcements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "company_news" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL,
    "url" TEXT NOT NULL,
    "sentiment" TEXT,
    "whyItMatters" TEXT,
    "sourceKey" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL,
    CONSTRAINT "company_news_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "earnings_assessments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "periodType" TEXT NOT NULL,
    "fiscalPart" INTEGER,
    "assessment" TEXT NOT NULL,
    "confidence" DECIMAL,
    "evidence" JSONB NOT NULL,
    "modelId" TEXT,
    "inputsHash" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "earnings_assessments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ingestion_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dataSourceId" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "recordsRead" INTEGER NOT NULL DEFAULT 0,
    "inserted" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "inputRef" TEXT,
    CONSTRAINT "ingestion_logs_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "data_sources" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "data_sources_key_key" ON "data_sources"("key");

-- CreateIndex
CREATE UNIQUE INDEX "industries_scheme_sector_industry_key" ON "industries"("scheme", "sector", "industry");

-- CreateIndex
CREATE UNIQUE INDEX "companies_isin_key" ON "companies"("isin");

-- CreateIndex
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");

-- CreateIndex
CREATE INDEX "companies_name_idx" ON "companies"("name");

-- CreateIndex
CREATE INDEX "companies_industryId_idx" ON "companies"("industryId");

-- CreateIndex
CREATE INDEX "securities_companyId_idx" ON "securities"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "securities_exchange_symbol_key" ON "securities"("exchange", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "securities_exchange_scripCode_key" ON "securities"("exchange", "scripCode");

-- CreateIndex
CREATE UNIQUE INDEX "securities_companyId_exchange_segment_key" ON "securities"("companyId", "exchange", "segment");

-- CreateIndex
CREATE INDEX "security_events_securityId_effectiveOn_idx" ON "security_events"("securityId", "effectiveOn");

-- CreateIndex
CREATE INDEX "financial_periods_companyId_periodEnd_idx" ON "financial_periods"("companyId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "financial_periods_companyId_periodType_periodEnd_key" ON "financial_periods"("companyId", "periodType", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "quarterly_results_periodId_basis_revision_key" ON "quarterly_results"("periodId", "basis", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "financial_metrics_resultId_key_key" ON "financial_metrics"("resultId", "key");

-- CreateIndex
CREATE INDEX "earnings_announcements_companyId_periodEnd_idx" ON "earnings_announcements"("companyId", "periodEnd");

-- CreateIndex
CREATE INDEX "earnings_announcements_announcedAt_idx" ON "earnings_announcements"("announcedAt");

-- CreateIndex
CREATE UNIQUE INDEX "earnings_announcements_companyId_exchange_announcedAt_version_basis_key" ON "earnings_announcements"("companyId", "exchange", "announcedAt", "version", "basis");

-- CreateIndex
CREATE INDEX "board_meetings_meetingDate_idx" ON "board_meetings"("meetingDate");

-- CreateIndex
CREATE UNIQUE INDEX "board_meetings_companyId_exchange_meetingDate_purpose_key" ON "board_meetings"("companyId", "exchange", "meetingDate", "purpose");

-- CreateIndex
CREATE INDEX "upcoming_results_expectedDate_idx" ON "upcoming_results"("expectedDate");

-- CreateIndex
CREATE UNIQUE INDEX "upcoming_results_companyId_fiscalYear_periodType_fiscalPart_key" ON "upcoming_results"("companyId", "fiscalYear", "periodType", "fiscalPart");

-- CreateIndex
CREATE INDEX "corporate_actions_companyId_exDate_idx" ON "corporate_actions"("companyId", "exDate");

-- CreateIndex
CREATE UNIQUE INDEX "corporate_actions_companyId_type_exDate_description_key" ON "corporate_actions"("companyId", "type", "exDate", "description");

-- CreateIndex
CREATE INDEX "corporate_announcements_companyId_announcedAt_idx" ON "corporate_announcements"("companyId", "announcedAt");

-- CreateIndex
CREATE UNIQUE INDEX "corporate_announcements_companyId_exchange_announcedAt_subject_key" ON "corporate_announcements"("companyId", "exchange", "announcedAt", "subject");

-- CreateIndex
CREATE INDEX "company_news_companyId_publishedAt_idx" ON "company_news"("companyId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "company_news_companyId_url_key" ON "company_news"("companyId", "url");

-- CreateIndex
CREATE INDEX "earnings_assessments_companyId_generatedAt_idx" ON "earnings_assessments"("companyId", "generatedAt");

-- CreateIndex
CREATE INDEX "ingestion_logs_job_startedAt_idx" ON "ingestion_logs"("job", "startedAt");
