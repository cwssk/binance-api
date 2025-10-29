import express from "express";

export default function (binance) {
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
  async function getSimpleEarnProductId(binance, asset) {
    const products = await binance.privateSapiRequest(
      "/sapi/v1/simple-earn/flexible/list",
      { asset },
      "GET"
    );

    if (products.rows?.length > 0) {
      return products.rows[0].productId;
    } else {
      throw new Error(`Product ID not found for ${asset}`);
    }
  }

  async function redeemFromEarn(binance, asset, amount) {
    try {
      const productId = await getSimpleEarnProductId(binance, asset);

      const result = await binance.privateSapiRequest(
        "/sapi/v1/simple-earn/flexible/redeem",
        { productId, amount },
        "POST"
      );

      console.log(`✅ Redeemed ${amount} ${asset} from Simple Earn`);
      return result;
    } catch (err) {
      console.error(`❌ Failed to redeem ${asset}:`, err.body || err.message);
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
      const ticker = await binance.prices(symbol);
      const price = parseFloat(ticker[symbol]);

      if (isNaN(price)) {
        return res.status(400).json({ error: `Invalid trading pair: ${symbol}` });
      }

      const base_value = base_asset_qty * price;
      const quote_value = parseFloat(quote_asset_qty);
      const total_value = base_value + quote_value;
      const target_each = total_value / 2;

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
        const info = await binance.exchangeInfo(symbol);
        const lotSize = info.symbols[0].filters.find(f => f.filterType === "LOT_SIZE");
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
          console.log(`[DEV MODE] Would ${action.includes("SELL") ? "sell" : "buy"} ${amount} ${base_asset}`);
        } else {
          if (action === "SELL_BASE_BUY_QUOTE") {
            // ถอน base_asset จาก Binance Earn ก่อนขาย
            await redeemFromEarn(binance, base_asset, amount);
            await new Promise(r => setTimeout(r, 5000)); // รอ 5 วิ
            trade_result = await binance.marketSell(symbol, amount);
          } else if (action === "BUY_BASE_SELL_QUOTE") {
            // ถอน quote_asset จาก Binance Earn ก่อนซื้อ
            const needed_quote = amount * price;
            const redeem_amount = needed_quote * 1.1; // +10% buffer
            console.log(`🔄 Need ${needed_quote} ${quote_asset}, redeeming ${redeem_amount}`);

            await redeemFromEarn(binance, quote_asset, redeem_amount);
            await new Promise(r => setTimeout(r, 5000)); // รอ 5 วิ
            trade_result = await binance.marketBuy(symbol, amount);
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
      console.error("Rebalance error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add this before the return router at the end
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

      const result = await redeemFromEarn(binance, asset, amount);
      
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
        details: error.body
      });
    }
  });

  return router;
}
