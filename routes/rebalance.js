import express from "express";

export default function (binance) {
  const router = express.Router();

  router.post("/", async (req, res) => {
    try {
      const { base_asset, quote_asset, base_asset_qty, quote_asset_qty } = req.body;

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

      const MAX_TRADE_VALUE_USD = parseFloat(process.env.MAX_TRADE_VALUE_USD || "100");
      const overLimit = diff_value > MAX_TRADE_VALUE_USD;

      if (action !== "BALANCED" && amount > 0 && !overLimit) {
        if (req.isDev) {
          console.log(`[DEV MODE] Would ${action.includes("SELL") ? "sell" : "buy"} ${amount} ${base_asset}`);
        } else {
          if (action === "SELL_BASE_BUY_QUOTE") {
            trade_result = await binance.marketSell(symbol, amount);
          } else {
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
        dev_mode: req.isDev,
        trade_result: overLimit
          ? "❌ Skipped (over limit)"
          : req.isDev
          ? "Simulated trade (no order sent)"
          : trade_result,
      });

    } catch (error) {
      console.error("Rebalance error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
