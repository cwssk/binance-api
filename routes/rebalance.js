import express from "express";
import { 
  getFlexibleProducts, 
  redeemFlexibleSavings,
  marketBuy,
  marketSell 
} from "../libs/binanceApi.js";

export default function (client) {
  const router = express.Router();

  // -----------------------------
  // 🧩 Helper: Adjust to step size
  // -----------------------------
  function adjustToStepSize(value, stepSize) {
    const precision = Math.round(-Math.log10(stepSize));
    const adjusted = Math.round(value / stepSize) * stepSize;
    return Number(adjusted.toFixed(precision));
  }

  // -------------------------------------
  // 🪙 Helper: Redeem from Simple Earn API
  // -------------------------------------
  async function getSimpleEarnProductId(client, asset) {
    try {
      const products = await getFlexibleProducts(client, asset);
      
      if (products.rows?.length > 0) {
        return products.rows[0].productId;
      }
      throw new Error(`Product ID not found for ${asset}`);
    } catch (error) {
      console.error(`❌ Failed to get product ID for ${asset}:`, error);
      throw error;
    }
  }

  async function redeemFromEarn(client, asset, amount) {
    try {
      const productId = await getSimpleEarnProductId(client, asset);
      const result = await redeemFlexibleSavings(client, productId, amount);
      
      console.log(`✅ Redeemed ${amount} ${asset} from Simple Earn`);
      return result;
    } catch (err) {
      console.error(`❌ Failed to redeem ${asset}:`, err);
      throw err;
    }
  }

  // ---------------------------
  // 📈 Main route: /rebalance
  // ---------------------------
  router.post("/", async (req, res) => {
    try {
      const { base_asset, quote_asset, base_asset_qty, quote_asset_qty } = req.body;

      // ✅ ตรวจ dev mode จากทั้ง req.isDev และ environment variable
      const isDev =
        req.isDev === true ||
        process.env.NODE_ENV === "development";

      console.log(`\n🌍 Environment: ${isDev ? "DEV" : "PROD"}`);

      if (!base_asset || !quote_asset || base_asset_qty == null || quote_asset_qty == null) {
        return res.status(400).json({ error: "Missing required parameters." });
      }

      const symbol = `${base_asset}${quote_asset}`.toUpperCase();
      const tickerResponse = await client.tickerPrice(symbol);
      const price = parseFloat(tickerResponse.data.price);

      if (isNaN(price)) {
        return res.status(400).json({ error: `Invalid trading pair: ${symbol}` });
      }

      const base_value = base_asset_qty * price;
      const quote_value = parseFloat(quote_asset_qty);
      const total_value = base_value + quote_value;
      const target_each = total_value / 2;
      console.log(`base_value: ${base_value} VS quote_value: ${quote_value} | total: ${total_value} | target_each: ${target_each}`);

      let action, amount, diff_value, trade_result = null;

      if (base_value > target_each) {
        diff_value = base_value - target_each;
        amount = diff_value / price;
        action = "SELL_BASE_BUY_QUOTE";
      } else if (quote_value > target_each) {
        diff_value = target_each - base_value;
        amount = diff_value / price;
        action = "BUY_BASE_SELL_QUOTE";
      } else {
        action = "BALANCED";
        amount = 0;
        diff_value = 0;
      }

      // ✅ ตรวจ stepSize จาก exchangeInfo
      if (amount > 0) {
        const exchangeInfo = await client.exchangeInfo({ symbol });
        const symbolInfo = exchangeInfo.data.symbols[0];
        const lotSize = symbolInfo.filters.find(f => f.filterType === "LOT_SIZE");
        if (lotSize && lotSize.stepSize) {
          const stepSize = parseFloat(lotSize.stepSize);
          const original = amount;
          amount = adjustToStepSize(amount, stepSize);

          if (original !== amount) {
            console.log(`[adjustToStepSize] ${symbol}: ${original} → ${amount} (stepSize=${stepSize})`);
          }
        }
      }

      const MAX_TRADE_VALUE_USD = parseFloat(process.env.MAX_TRADE_VALUE_USD || "100");
      const overLimit = diff_value > MAX_TRADE_VALUE_USD;

      // -----------------------------------
      // 💰 Execute trade (with Earn redeem)
      // -----------------------------------
      if (action !== "BALANCED" && amount > 0 && !overLimit) {
        if (isDev) {
          console.log(`[DEV MODE] Would ${action === "SELL_BASE_BUY_QUOTE" ? "sell" : "buy"} ${amount} ${base_asset}`);
        } else {
          if (action === "SELL_BASE_BUY_QUOTE") {
            console.log(`🔄 Redeeming ${amount} ${base_asset}`);
            await redeemFromEarn(client, base_asset, amount);
            await new Promise(r => setTimeout(r, 5000));
            trade_result = await marketSell(client, symbol, amount);
          } else if (action === "BUY_BASE_SELL_QUOTE") {
            const needed_quote = amount * price;  // แปลงจำนวน base เป็นมูลค่า quote
            console.log(`🔄 Redeeming ${needed_quote} ${quote_asset}`);
            await redeemFromEarn(client, quote_asset, needed_quote);
            await new Promise(r => setTimeout(r, 5000));
            trade_result = await marketBuy(client, symbol, needed_quote);
          }
        }
      }

      res.json({
        symbol,
        price,
        base_asset,
        quote_asset,
        base_asset_qty,
        quote_asset_qty,
        base_value,
        quote_value,
        total_value,
        target_each,
        action,
        trade_amount: amount,
        trade_value: diff_value,
        trade_over_limit: overLimit,
        trade_limit_usd: MAX_TRADE_VALUE_USD,
        dev_mode: isDev,
        trade_result: overLimit
          ? "❌ Skipped (over limit)"
          : isDev
          ? "Simulated trade (no order sent)"
          : trade_result,
      });

    } catch (error) {
      console.error("❌ Rebalance error:", error);
      res.status(500).json({ 
        success: false,
        error: error.message,
        details: error.response?.data || error.stack,
        timestamp: Date.now()
      });
    }
  });

  // Update test-redeem route
  router.post("/test-redeem", async (req, res) => {
    try {
      const { asset, amount } = req.body;

      if (!asset || !amount) {
        return res.status(400).json({ 
          error: "Missing required parameters. Please provide asset and amount." 
        });
      }

      // Check if in dev mode
      const isDev = req.isDev === true;
      console.log(`\n🌍 Environment: ${isDev ? "DEV" : "PROD"}`);

      if (isDev) {
        console.log(`[DEV MODE] Would redeem ${amount} ${asset} from Simple Earn`);
        return res.json({
          message: "Test mode - no actual redemption",
          asset,
          amount
        });
      }

      const result = await redeemFromEarn(client, asset, amount);
      
      res.json({
        success: true,
        asset,
        amount,
        result
      });

    } catch (error) {
      console.error("Redeem test error:", error);
      res.status(500).json({ 
        error: error.message,
        details: error.response?.data || error.stack
      });
    }
  });

  return router;
}
