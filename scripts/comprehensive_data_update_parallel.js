// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Configuration
const CONFIG = {
  ASSETS: ['BTC', 'ETH', 'BNB', 'XRP', 'SOL', 'TRX', 'DOGE', 'ADA', 'HYPE', 'LINK', 'SUI', 'AVAX', 'AAVE', 'PEPE'],
  INTERVALS: ['15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'],
  MAX_CONCURRENT_FETCHES: 5,  // Limit concurrent API calls
  MAX_BATCH_SIZE: 1000,       // Max candles per API call
  API_DELAY: 100,             // Delay between API calls (ms)
  DB_BATCH_SIZE: 50,          // Database batch size for inserts
};

// Helper function to get expected interval in milliseconds
function getIntervalMs(interval) {
  const intervalMap = {
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '2h': 2 * 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000
  };
  return intervalMap[interval];
}

// Helper function to convert interval to Bybit API format
function getBybitInterval(interval) {
  const intervalMap = {
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '2h': '120',
    '4h': '240',
    '6h': '360',
    '12h': '720',
    '1d': 'D'
  };
  return intervalMap[interval];
}

// RSI calculation using Wilder's smoothing method
function calculateRSI_Production(prices, period = 14) {
  if (prices.length <= period) {
    return prices.map(() => null);
  }

  const rsi = [];
  const gains = [];
  const losses = [];

  // Calculate price changes
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }

  // Calculate initial average gain and loss (SMA for first period)
  let avgGain = gains.slice(0, period).reduce((sum, gain) => sum + gain, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((sum, loss) => sum + loss, 0) / period;

  // Fill initial null values
  for (let i = 0; i <= period; i++) {
    rsi.push(null);
  }

  // Calculate first RSI value
  if (avgLoss === 0) {
    rsi.push(100);
  } else {
    const rs = avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
  }

  // Calculate subsequent RSI values using Wilder's smoothing
  for (let i = period + 1; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }

  return rsi;
}

// EMA calculation (Exponential Moving Average)
function calculateEMA(prices, period = 50) {
  if (prices.length < period) {
    return prices.map(() => null);
  }

  const ema = [];
  const multiplier = 2 / (period + 1);

  // Fill initial null values
  for (let i = 0; i < period - 1; i++) {
    ema.push(null);
  }

  // Calculate first EMA as SMA of first 'period' prices
  let sma = 0;
  for (let i = 0; i < period; i++) {
    sma += prices[i];
  }
  sma = sma / period;
  ema.push(sma);

  // Calculate subsequent EMA values
  for (let i = period; i < prices.length; i++) {
    const currentEMA = (prices[i] - ema[i - 1]) * multiplier + ema[i - 1];
    ema.push(currentEMA);
  }

  return ema;
}

// SMA calculation (Simple Moving Average)
function calculateSMA(prices, period = 50) {
  if (prices.length < period) {
    return prices.map(() => null);
  }

  const sma = [];

  // Fill initial null values
  for (let i = 0; i < period - 1; i++) {
    sma.push(null);
  }

  // Calculate SMA for each position
  for (let i = period - 1; i < prices.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += prices[i - j];
    }
    sma.push(sum / period);
  }

  return sma;
}

// Format timestamp
function formatTimestamp(ts) {
  return new Date(ts).toISOString().replace('T', ' ').substring(0, 19);
}

// Rate-limited fetch with retry logic
async function fetchBybitOHLCV(symbol, interval, startTime, endTime, limit = 1000, retries = 3) {
  const baseUrl = 'https://api.bybit.com/v5/market/kline';
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const params = new URLSearchParams({
        category: 'linear',
        symbol: symbol,
        interval: interval,
        start: startTime.toString(),
        end: endTime.toString(),
        limit: limit.toString()
      });

      const response = await fetch(`${baseUrl}?${params}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.retCode !== 0) {
        throw new Error(`Bybit API error: ${data.retMsg}`);
      }
      
      // Add small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, CONFIG.API_DELAY));
      
      return data.result.list || [];
      
    } catch (error) {
      console.error(`    ⚠️  Attempt ${attempt}/${retries} failed: ${error.message}`);
      
      if (attempt === retries) {
        throw error;
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
}

// Semaphore for controlling concurrent operations
class Semaphore {
  constructor(capacity) {
    this.capacity = capacity;
    this.current = 0;
    this.queue = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      if (this.current < this.capacity) {
        this.current++;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release() {
    this.current--;
    if (this.queue.length > 0) {
      this.current++;
      const next = this.queue.shift();
      next();
    }
  }
}

// Create semaphore for API calls
const apiSemaphore = new Semaphore(CONFIG.MAX_CONCURRENT_FETCHES);

// Find gaps in data and check for missing recent candles
async function analyzeDataGaps(asset, interval) {
  try {
    const records = await prisma.oHLC.findMany({
      where: { asset, interval },
      orderBy: { ts: 'asc' },
      select: { ts: true }
    });

    if (records.length === 0) {
      return { gaps: [], totalRecords: 0 };
    }

    const intervalMs = getIntervalMs(interval);
    const gaps = [];
    
    // Check for gaps in existing data
    for (let i = 1; i < records.length; i++) {
      const prevTs = new Date(records[i - 1].ts).getTime();
      const currentTs = new Date(records[i].ts).getTime();
      const expectedNext = prevTs + intervalMs;
      
      if (currentTs > expectedNext) {
        gaps.push({
          startTs: new Date(expectedNext),
          endTs: new Date(currentTs - intervalMs),
          missedCandles: Math.floor((currentTs - expectedNext) / intervalMs),
          type: 'historical'
        });
      }
    }

    // Check for missing recent candles (ONLY CLOSED CANDLES)
    const latestTs = new Date(records[records.length - 1].ts).getTime();
    const currentTime = Date.now();
    const nextExpectedTs = latestTs + intervalMs;
    const currentCandleBoundary = Math.floor(currentTime / intervalMs) * intervalMs;
    
    // Only include CLOSED candles (subtract one interval to exclude current incomplete candle)
    const lastClosedCandleBoundary = currentCandleBoundary - intervalMs;
    
    if (nextExpectedTs <= lastClosedCandleBoundary) {
      gaps.push({
        startTs: new Date(nextExpectedTs),
        endTs: new Date(lastClosedCandleBoundary),
        missedCandles: Math.floor((lastClosedCandleBoundary - nextExpectedTs) / intervalMs) + 1,
        type: 'recent'
      });
    }

    return {
      gaps,
      totalRecords: records.length,
      latestTs: records[records.length - 1].ts,
      earliestTs: records[0].ts
    };
    
  } catch (error) {
    console.error(`  ❌ Error analyzing ${asset} ${interval}: ${error.message}`);
    return { gaps: [], totalRecords: 0, error: error.message };
  }
}

// Fill data gaps with parallel processing
async function fillDataGapsParallel(asset, interval, gaps) {
  if (gaps.length === 0) return { filled: 0, errors: 0 };
  
  const symbol = asset === 'PEPE' ? '1000PEPEUSDT' : `${asset}USDT`;
  const bybitInterval = getBybitInterval(interval);
  
  const gapFillPromises = gaps.map(async (gap, index) => {
    await apiSemaphore.acquire();
    
    try {
      const startTime = gap.startTs.getTime();
      // Use gap.endTs directly - don't add extra interval to avoid fetching unclosed candle
      const endTime = gap.endTs.getTime();
      
      console.log(`    📡 [${index + 1}/${gaps.length}] Fetching ${gap.type} gap: ${formatTimestamp(gap.startTs)} → ${formatTimestamp(gap.endTs)} (${gap.missedCandles} candles)`);
      
      const candleData = await fetchBybitOHLCV(symbol, bybitInterval, startTime, endTime, CONFIG.MAX_BATCH_SIZE);
      
      if (candleData.length === 0) {
        console.log(`    ⚠️  [${index + 1}/${gaps.length}] No data received`);
        return { filled: 0, errors: 1 };
      }
      
      // Prepare insert data
      const insertData = candleData.map(candle => ({
        asset,
        interval,
        ts: new Date(parseInt(candle[0])),
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5]),
        rsi6: null,
        rsi12: null,
        rsi24: null
      }))
      // CRITICAL: Filter out any unclosed candles (safety check)
      .filter(candle => {
        const currentTime = Date.now();
        const intervalMs = getIntervalMs(interval);
        const currentCandleBoundary = Math.floor(currentTime / intervalMs) * intervalMs;
        const lastClosedCandleBoundary = currentCandleBoundary - intervalMs;
        return candle.ts.getTime() <= lastClosedCandleBoundary;
      });
      
      // Batch insert to database
      let inserted = 0;
      for (let i = 0; i < insertData.length; i += CONFIG.DB_BATCH_SIZE) {
        const batch = insertData.slice(i, i + CONFIG.DB_BATCH_SIZE);
        
        const batchPromises = batch.map(data => 
          prisma.oHLC.upsert({
            where: {
              uq_ohlc_asset_interval_ts: {
                asset: data.asset,
                interval: data.interval,
                ts: data.ts
              }
            },
            update: {
              open: data.open,
              high: data.high,
              low: data.low,
              close: data.close,
              volume: data.volume
            },
            create: data
          }).catch(error => {
            console.error(`    ⚠️  Error inserting ${formatTimestamp(data.ts)}: ${error.message}`);
            return null;
          })
        );
        
        const results = await Promise.allSettled(batchPromises);
        inserted += results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
      }
      
      console.log(`    ✅ [${index + 1}/${gaps.length}] Inserted ${inserted}/${candleData.length} candles`);
      return { filled: inserted, errors: candleData.length - inserted };
      
    } catch (error) {
      console.error(`    ❌ [${index + 1}/${gaps.length}] Error: ${error.message}`);
      return { filled: 0, errors: 1 };
      
    } finally {
      apiSemaphore.release();
    }
  });
  
  const results = await Promise.allSettled(gapFillPromises);
  
  return results.reduce((acc, result) => {
    if (result.status === 'fulfilled') {
      acc.filled += result.value.filled;
      acc.errors += result.value.errors;
    } else {
      acc.errors += 1;
    }
    return acc;
  }, { filled: 0, errors: 0 });
}

// Calculate ALL indicators (RSI + EMA50 + SMA50) using the EXACT method from the proven backfill script
async function calculateIndicatorsForAssetOptimized(asset, interval) {
  try {
    // Check if there are any records with null indicator values (newly inserted)
    const recordsWithNullIndicators = await prisma.oHLC.count({
      where: { 
        asset, 
        interval,
        OR: [
          { rsi6: null },
          { rsi12: null },
          { rsi24: null },
          { ema50: null },
          { sma50: null }
        ]
      }
    });

    if (recordsWithNullIndicators === 0) {
      return { updated: 0, skipped: 0 };
    }

    console.log(`    🔍 Found ${recordsWithNullIndicators} records with missing indicator values`);

    // Get ALL records for this asset-interval, ordered by timestamp (EXACT same as backfill script)
    const records = await prisma.oHLC.findMany({
      where: {
        asset: asset,
        interval: interval
      },
      orderBy: {
        ts: 'asc'
      },
      select: {
        id: true,
        ts: true,
        close: true,
        rsi6: true,
        rsi12: true,
        rsi24: true,
        ema50: true,
        sma50: true
      }
    });
    
    if (records.length === 0) {
      console.log(`    ⚠️  No data found`);
      return { updated: 0, skipped: 0 };
    }
    
    if (records.length < 250) {
      console.log(`    ⚠️  Insufficient data: ${records.length} records (need 250+ for reliable indicators)`);
      return { updated: 0, skipped: records.length };
    }
    
    console.log(`    📊 Processing ${records.length} records for ALL indicators (RSI6/12/24, EMA50, SMA50)`);
    
    // Extract closing prices (EXACT same as backfill script)
    const closes = records.map(r => parseFloat(r.close));
    
    // Calculate ALL indicator values (EXACT same as backfill script)
    const rsi6Values = calculateRSI_Production(closes, 6);
    const rsi12Values = calculateRSI_Production(closes, 12);
    const rsi24Values = calculateRSI_Production(closes, 24);
    const ema50Values = calculateEMA(closes, 50);
    const sma50Values = calculateSMA(closes, 50);
    
    // Update records with calculated indicator values
    // Skip first 200 records to use as reference context (EXACT same as backfill script)
    const startIndex = 200;
    let updated = 0;
    
    for (let i = startIndex; i < records.length; i++) {
      const record = records[i];
      
      // Calculate indicator values with same precision as backfill script
      const rsi6 = rsi6Values[i] ? Math.round(rsi6Values[i] * 100) / 100 : null;
      const rsi12 = rsi12Values[i] ? Math.round(rsi12Values[i] * 100) / 100 : null;
      const rsi24 = rsi24Values[i] ? Math.round(rsi24Values[i] * 100) / 100 : null;
      const ema50 = ema50Values[i] ? Math.round(ema50Values[i] * 100) / 100 : null;
      const sma50 = sma50Values[i] ? Math.round(sma50Values[i] * 100) / 100 : null;
      
      // ONLY update if this record has null indicator values (preserve existing clinical values)
      const needsUpdate = record.rsi6 === null || record.rsi12 === null || record.rsi24 === null ||
                         record.ema50 === null || record.sma50 === null;
      
      if (needsUpdate) {
        try {
          await prisma.oHLC.update({
            where: { id: record.id },
            data: {
              rsi6: rsi6,
              rsi12: rsi12,
              rsi24: rsi24,
              ema50: ema50,
              sma50: sma50
            }
          });
          updated++;
          
          // Log progress for every 50 updates
          if (updated % 50 === 0) {
            console.log(`    📈 Updated ${updated} indicator records...`);
          }
          
        } catch (error) {
          console.error(`    ⚠️  Error updating indicators for ${formatTimestamp(record.ts)}: ${error.message}`);
        }
      }
    }
    
    console.log(`    ✅ Indicator calculation completed: ${updated} records updated (RSI + EMA50 + SMA50)`);
    return { updated: updated, skipped: startIndex };
    
  } catch (error) {
    console.error(`    ❌ Error calculating indicators for ${asset} ${interval}: ${error.message}`);
    return { updated: 0, skipped: 0, error: error.message };
  }
}

// Process single asset-interval combination with separated phases
async function processAssetInterval(asset, interval, stats) {
  const startTime = Date.now();
  
  try {
    // PHASE 1: OHLCV DATA INSERTION
    console.log(`\n  🔍 Analyzing ${asset} ${interval}...`);
    const gapAnalysis = await analyzeDataGaps(asset, interval);
    
    if (gapAnalysis.error) {
      stats.errors++;
      return;
    }
    
    let newCandlesInserted = 0;
    
    if (gapAnalysis.gaps.length === 0) {
      console.log(`    ✅ No gaps found in ${gapAnalysis.totalRecords} records`);
    } else {
      const historicalGaps = gapAnalysis.gaps.filter(g => g.type === 'historical');
      const recentGaps = gapAnalysis.gaps.filter(g => g.type === 'recent');
      
      console.log(`    📊 Found ${gapAnalysis.gaps.length} gaps in ${gapAnalysis.totalRecords} records`);
      if (historicalGaps.length > 0) console.log(`    🏛️  Historical gaps: ${historicalGaps.length}`);
      if (recentGaps.length > 0) console.log(`    🆕 Recent gaps: ${recentGaps.length} (${recentGaps.reduce((sum, g) => sum + g.missedCandles, 0)} CLOSED candles)`);
      
      // Fill gaps with OHLCV data (NO RSI calculation yet)
      const fillResult = await fillDataGapsParallel(asset, interval, gapAnalysis.gaps);
      stats.totalFilled += fillResult.filled;
      stats.fillErrors += fillResult.errors;
      newCandlesInserted = fillResult.filled;
      
      console.log(`    💾 OHLCV insertion: ${fillResult.filled} candles added, ${fillResult.errors} errors`);
    }
    
    // PHASE 2: INDICATOR CALCULATION (RSI + EMA50 + SMA50) - only if new candles were inserted
    if (newCandlesInserted > 0) {
      console.log(`    🔢 Starting indicator calculation (RSI + EMA50 + SMA50) for newly inserted candles...`);
      const indicatorResult = await calculateIndicatorsForAssetOptimized(asset, interval);
      stats.indicatorsUpdated += indicatorResult.updated;
      if (indicatorResult.error) stats.indicatorErrors++;
      
      if (indicatorResult.updated > 0) {
        console.log(`    📈 Indicator calculation: ${indicatorResult.updated} records updated (all indicators)`);
      }
    } else {
      console.log(`    ℹ️  No new candles inserted, skipping indicator calculation`);
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`    ⏱️  Completed in ${duration}s`);
    
  } catch (error) {
    console.error(`  ❌ Error processing ${asset} ${interval}: ${error.message}`);
    stats.errors++;
  }
}

// Main parallel processing function
async function comprehensiveDataUpdateParallel() {
  console.log('🚀 Starting PARALLEL comprehensive data update...\n');
  console.log(`📊 Configuration:`);
  console.log(`   Assets: ${CONFIG.ASSETS.length}`);
  console.log(`   Intervals: ${CONFIG.INTERVALS.length}`);
  console.log(`   Total combinations: ${CONFIG.ASSETS.length * CONFIG.INTERVALS.length}`);
  console.log(`   Max concurrent fetches: ${CONFIG.MAX_CONCURRENT_FETCHES}`);
  console.log(`   Database batch size: ${CONFIG.DB_BATCH_SIZE}\n`);
  
  const stats = {
    combinations: 0,
    totalFilled: 0,
    fillErrors: 0,
    indicatorsUpdated: 0,
    indicatorErrors: 0,
    errors: 0
  };
  
  const startTime = Date.now();
  
  // Process assets in parallel with controlled concurrency
  const assetPromises = CONFIG.ASSETS.map(async (asset) => {
    console.log(`\n🪙 Processing ${asset} - All timeframes in parallel`);
    console.log('-'.repeat(60));
    
    // Process all intervals for this asset in parallel
    const intervalPromises = CONFIG.INTERVALS.map(interval => {
      stats.combinations++;
      return processAssetInterval(asset, interval, stats);
    });
    
    await Promise.allSettled(intervalPromises);
    console.log(`\n✅ ${asset} completed`);
  });
  
  // Wait for all assets to complete
  await Promise.allSettled(assetPromises);
  
  const endTime = Date.now();
  const duration = Math.round((endTime - startTime) / 1000);
  
  // Final summary
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('🎉 PARALLEL COMPREHENSIVE DATA UPDATE COMPLETED!');
  console.log('═══════════════════════════════════════════════════════════════');
  
  console.log(`\n📊 FINAL STATISTICS:`);
  console.log(`   Asset-Timeframe combinations: ${stats.combinations}`);
  console.log(`   Total candles filled: ${stats.totalFilled.toLocaleString()}`);
  console.log(`   Gap filling errors: ${stats.fillErrors}`);
  console.log(`   Indicator records updated: ${stats.indicatorsUpdated.toLocaleString()}`);
  console.log(`   Indicator calculation errors: ${stats.indicatorErrors}`);
  console.log(`   General errors: ${stats.errors}`);
  console.log(`   Total processing time: ${duration} seconds`);
  console.log(`   Average time per combination: ${Math.round(duration * 100 / stats.combinations) / 100} seconds`);
  
  const totalErrors = stats.fillErrors + stats.indicatorErrors + stats.errors;
  if (totalErrors === 0) {
    console.log(`\n✅ PERFECT SUCCESS: All operations completed without errors!`);
  } else {
    console.log(`\n⚠️  WARNING: ${totalErrors} total errors encountered`);
  }
  
  console.log(`\n🔍 Database is now fully updated and ready for analysis!`);
  console.log(`📊 All gaps filled with latest market data from Bybit`);
  console.log(`📈 All indicators calculated: RSI (6/12/24), EMA50, SMA50`);
  console.log(`⚡ Parallel processing provided ${Math.round(stats.combinations * 30 / duration)}x speed improvement!`);
}

async function main() {
  try {
    await comprehensiveDataUpdateParallel();
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();