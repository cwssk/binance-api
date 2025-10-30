import express from "express";

export default function (client) {
  const router = express.Router();

  // GET /price/:symbol
  router.get("/:symbol", async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const response = await client.tickerPrice(symbol);

      const rawPrice =
        response?.data?.price ?? response?.price ?? (typeof response === "string" ? response : undefined);

      const price = parseFloat(rawPrice);

      if (isNaN(price)) {
        throw new Error(`Invalid price received for ${symbol}`);
      }

      console.log(`✅ Price fetched for ${symbol}: ${price}`);

      res.json({
        symbol,
        price,
        timestamp: Date.now(),
        success: true
      });

    } catch (error) {
      console.error("❌ Price fetch error:", error);
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
