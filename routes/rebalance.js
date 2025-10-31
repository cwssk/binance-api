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
      // const isDev =
      //   req.isDev === true ||
      //   process.env.NODE_ENV === "development";
      const isDev = false; // ปิด dev mode ชั่วคราว

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
      console.log(`base_asset_qty: ${base_asset_qty} ${base_asset} @ ${price} = ${base_value} ${quote_asset}`);
      console.log(`base_value: ${base_value} VS quote_value: ${quote_value} | total: ${total_value} | target_each: ${target_each}`);

      let action, amount, diff_value, trade_result = null;

      if (base_value > target_each) {
        diff_value = base_value - target_each;
        amount = diff_value / price;
        action = "SELL";
      } else if (quote_value > target_each) {
        diff_value = target_each - base_value;
        amount = diff_value / price;
        action = "BUY";
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
          console.log(`[DEV MODE] Simulated trade (no order sent)`);
        } else {
          if (action === "SELL") {
            console.log(`Inteded: ${action} | Amount: ${amount} ${base_asset} @ ${price} | Value: ${amount * price} ${quote_asset}`);
            // console.log(`🔄 Redeeming ${amount} ${base_asset}`);
            // await redeemFromEarn(client, base_asset, amount);
            // await new Promise(r => setTimeout(r, 5000));
            // trade_result = await marketSell(client, symbol, amount);
            trade_result = {
              "symbol": "BTCUSDT",
              "orderId": 8448418,
              "orderListId": -1,
              "clientOrderId": "VHNp5iD7mI4g8rQj9UP2Ph",
              "transactTime": 1761927672752,
              "price": "0.00000000",
              "origQty": "0.00024000",
              "executedQty": "0.00024000",
              "origQuoteOrderQty": "0.00000000",
              "cummulativeQuoteQty": "26.36562720",
              "status": "FILLED",
              "timeInForce": "GTC",
              "type": "MARKET",
              "side": "SELL",
              "workingTime": 1761927672752,
              "fills": [
                {
                  "price": "109856.78000000",
                  "qty": "0.00024000",
                  "commission": "0.00000000",
                  "commissionAsset": "USDT",
                  "tradeId": 3930762
                }
              ],
              "selfTradePreventionMode": "EXPIRE_MAKER"
            };
          } else if (action === "BUY") {
            console.log(`Inteded: ${action} | Amount: ${amount} ${base_asset} @ ${price} | Value: ${amount * price} ${quote_asset}`);
            // const needed_quote = amount * price;  // แปลงจำนวน base เป็นมูลค่า quote
            // console.log(`🔄 Redeeming ${needed_quote} ${quote_asset}`);
            // await redeemFromEarn(client, quote_asset, needed_quote);
            // await new Promise(r => setTimeout(r, 5000));
            // trade_result = await marketBuy(client, symbol, needed_quote);
            trade_result = {
              "symbol": "BTCUSDT",
              "orderId": 8447928,
              "orderListId": -1,
              "clientOrderId": "c70UBog0BieekNnGMozEHL",
              "transactTime": 1761927561654,
              "price": "0.00000000",
              "origQty": "0.00022000",
              "executedQty": "0.00022000",
              "origQuoteOrderQty": "25.00000000",
              "cummulativeQuoteQty": "24.17513780",
              "status": "FILLED",
              "timeInForce": "GTC",
              "type": "MARKET",
              "side": "BUY",
              "workingTime": 1761927561654,
              "fills": [
                {
                  "price": "109886.99000000",
                  "qty": "0.00022000",
                  "commission": "0.00000000",
                  "commissionAsset": "BTC",
                  "tradeId": 3930569
                }
              ],
              "selfTradePreventionMode": "EXPIRE_MAKER"
            };
          }
          console.log(`Actual: ${action} | Amount: ${trade_result.executedQty} ${base_asset} @ ${trade_result.cummulativeQuoteQty / trade_result.executedQty} | Value: ${trade_result.cummulativeQuoteQty} ${quote_asset}`);
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

  return router;
}
